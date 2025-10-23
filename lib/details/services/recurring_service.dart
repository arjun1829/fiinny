// lib/services/recurring_service.dart
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/shared_item.dart';
import '../models/recurring_rule.dart';
import '../models/recurring_scope.dart';

// Loan linking
import 'package:lifemap/models/loan_model.dart';
import 'package:lifemap/services/loan_service.dart';

/// Firestore layouts supported:
/// - Friend mirror: users/{userPhone}/friends/{friendId}/recurring/{itemId}  (and mirrored at /users/{friendId}/friends/{userPhone}/...)
/// - Group:         groups/{groupId}/recurring/{itemId}
///
/// All collectionGroup('recurring') docs should include `participants.userIds: [ ... ]`
/// so `streamAll(userPhone)` works across both trees.

class RecurringService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // ==================== SCOPE WRAPPERS (friend or group) ====================

// Stream all recurring items for a given scope (friend or group).
  Stream<List<SharedItem>> streamByScope(RecurringScope scope) {
    return _colFor(scope)
        .orderBy('nextDueAt')
        .snapshots()
        .map((s) => s.docs.map(_mapDocSafe).whereType<SharedItem>().toList());
  }

// Pause / resume / end for a given scope.
  Future<void> pauseScope(RecurringScope scope, String id) =>
      _setStatusScope(scope, id, 'paused');

  Future<void> resumeScope(RecurringScope scope, String id) =>
      _setStatusScope(scope, id, 'active');

  Future<void> endScope(RecurringScope scope, String id) =>
      _setStatusScope(scope, id, 'ended');

// Mark paid for a given scope (advances nextDueAt and optionally logs a payment).
  Future<void> markPaidScope(
      RecurringScope scope,
      String id, {
        double? amount,
        DateTime? paidAt,
        bool logPayment = true,
      }) =>
      _markPaidScope(scope, id, amount: amount, paidAt: paidAt, logPayment: logPayment);

// ==================== INTERNAL (scope helpers) ====================

  Future<void> _setStatusScope(
      RecurringScope scope,
      String id,
      String status,
      ) async {
    await _docFor(scope, id).set({
      'rule': {'status': status},
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
  // ---- CREATE (GROUP) ----

  /// Create a recurring item in a group's /groups/{groupId}/recurring/{id}.
  /// Returns the new doc id.
  Future<String> addToGroup(
    String groupId,
    SharedItem item, {
    List<String>? participantUserIds,
  }) async {
    final data = item.toJson();
    data['createdAt'] ??= FieldValue.serverTimestamp();
    data['updatedAt'] = FieldValue.serverTimestamp();

    final participantSet = <String>{};
    for (final phone in [...?participantUserIds, ...?item.participantUserIds]) {
      final trimmed = phone.trim();
      if (trimmed.isNotEmpty) participantSet.add(trimmed);
    }
    final participants = participantSet.toList();

    if (participants.isNotEmpty) {
      final participantsTop = (data['participants'] as Map?)?.cast<String, dynamic>() ?? {};
      participantsTop['userIds'] = participants;
      data['participants'] = participantsTop;
    }

    data['ownerUserId'] ??= item.ownerUserId ?? (participants.isNotEmpty ? participants.first : null);
    data['groupId'] ??= item.groupId ?? groupId;
    data['sharing'] ??= item.sharing ?? 'group';

    // Normalize rule.anchorDate -> Timestamp
    if (data['rule'] is Map) {
      final rule = (data['rule'] as Map).cast<String, dynamic>();
      final ad = rule['anchorDate'];
      if (ad is DateTime) rule['anchorDate'] = Timestamp.fromDate(ad);
      if (ad is String) {
        try { rule['anchorDate'] = Timestamp.fromDate(DateTime.parse(ad)); } catch (_) {}
      }
      rule['status'] ??= 'active';
      data['rule'] = rule;
    }

    // Respect provided nextDueAt or compute a safe default
    if (data['nextDueAt'] == null && item.rule.anchorDate != null) {
      final next = computeNextDue(item.rule, from: item.rule.anchorDate);
      data['nextDueAt'] = Timestamp.fromDate(next);
    }

    final ref = _colGroup(groupId).doc();
    await ref.set(data);
    return ref.id;
  }

  /// (Optional) store notify prefs at group item level (same shape you use elsewhere)
  Future<void> setNotifyPrefsGroup({
    required String groupId,
    required String itemId,
    required bool enabled,
    required int daysBefore,
    required String timeHHmm,
  }) async {
    final payload = {
      'notify': {
        'enabled': enabled,
        'daysBefore': daysBefore,
        'time': timeHHmm,
        'both': true, // group-wide; tweak if you later support per-member
      },
      'updatedAt': FieldValue.serverTimestamp(),
    };
    await _docGroup(groupId, itemId).set(payload, SetOptions(merge: true));
  }


  Future<void> _markPaidScope(
      RecurringScope scope,
      String id, {
        double? amount,
        DateTime? paidAt,
        bool logPayment = true,
      }) async {
    final ref = _docFor(scope, id);
    final snap = await ref.get();
    if (!snap.exists) return;

    final data = snap.data()!;
    final item = SharedItem.fromJson(snap.id, data);

    // Compute next due based on current rule
    final now = paidAt ?? DateTime.now();
    final next = computeNextDue(item.rule, from: now);

    await _db.runTransaction((tx) async {
      tx.set(ref, {
        'nextDueAt': Timestamp.fromDate(next),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      if (logPayment) {
        final p = ref.collection('payments').doc();
        tx.set(p, {
          'paidAt': Timestamp.fromDate(now),
          if (amount != null) 'amount': amount,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
    });
  }


  // ----------------- Paths (friend) -----------------
  CollectionReference<Map<String, dynamic>> _colFriend(
      String userPhone,
      String friendId,
      ) =>
      _db
          .collection('users')
          .doc(userPhone)
          .collection('friends')
          .doc(friendId)
          .collection('recurring');

  DocumentReference<Map<String, dynamic>> _docFriend(
      String userPhone,
      String friendId,
      String id,
      ) =>
      _colFriend(userPhone, friendId).doc(id);

  // ----------------- Paths (group) -----------------
  CollectionReference<Map<String, dynamic>> _colGroup(
      String groupId,
      ) =>
      _db.collection('groups').doc(groupId).collection('recurring');

  DocumentReference<Map<String, dynamic>> _docGroup(
      String groupId,
      String id,
      ) =>
      _colGroup(groupId).doc(id);
  // ----------------- Scope helper -----------------
  CollectionReference<Map<String, dynamic>> _colFor(RecurringScope scope) {
    return scope.isGroup
        ? _colGroup(scope.groupId!)
        : _colFriend(scope.userPhone!, scope.friendId!);
  }

  DocumentReference<Map<String, dynamic>> _docFor(
      RecurringScope scope,
      String id,
      ) {
    return scope.isGroup
        ? _docGroup(scope.groupId!, id)
        : _docFriend(scope.userPhone!, scope.friendId!, id);
  }

  // ---- Safe mapper so one bad doc doesn't break the stream
  SharedItem? _mapDocSafe(QueryDocumentSnapshot<Map<String, dynamic>> d) {
  try {
  final data = d.data();
  return SharedItem.fromJson(d.id, data);
  } catch (e, st) {
  if (kDebugMode) {
  // ignore: avoid_print
  print('[RecurringService] fromJson failed for ${d.id}: $e\n$st');
  }
  return null; // skip bad doc, keep stream alive
  }
  }

  // ---------- Mirror helper for friend paths ----------
  Future<T> withMirror<T>({
  required String userPhone,
  required String friendId,
  required String docId, // ensure same id on both sides
  required Future<T> Function(
  WriteBatch batch,
  DocumentReference<Map<String, dynamic>> mine,
  DocumentReference<Map<String, dynamic>> peers,
  )
  action,
  }) async {
  final mine = _docFriend(userPhone, friendId, docId);
  final peers = _docFriend(friendId, userPhone, docId);
  final batch = _db.batch();
  final result = await action(batch, mine, peers);
  await batch.commit();
  return result;
  }

  // ---------------------------------------------------------------------------
  // SINGLE READS / ONCE-OFF HELPERS
  // ---------------------------------------------------------------------------
  Future<SharedItem?> get(String userPhone, String friendId, String id) async {
  try {
  final snap = await _docFriend(userPhone, friendId, id).get();
  if (!snap.exists) return null;
  final data = snap.data();
  if (data == null) return null;
  return SharedItem.fromJson(snap.id, data);
  } catch (e, st) {
  if (kDebugMode) {
  // ignore: avoid_print
  print('[RecurringService] get($id) failed: $e\n$st');
  }
  return null;
  }
  }

  /// Group read variant.
  Future<SharedItem?> getInGroup(String groupId, String id) async {
  try {
  final snap = await _docGroup(groupId, id).get();
  if (!snap.exists) return null;
  final data = snap.data();
  if (data == null) return null;
  return SharedItem.fromJson(snap.id, data);
  } catch (e, st) {
  if (kDebugMode) {
  print('[RecurringService] getInGroup($id) failed: $e\n$st');
  }
  return null;
  }
  }

  Future<bool> exists(String userPhone, String friendId, String id) async {
  try {
  final snap = await _docFriend(userPhone, friendId, id).get();
  return snap.exists;
  } catch (_) {
  return false;
  }
  }

  Future<List<SharedItem>> listOnceByFriend(
  String userPhone,
  String friendId,
  ) async {
  final q = await _colFriend(userPhone, friendId).orderBy('nextDueAt').get();
  return q.docs.map(_mapDocSafe).whereType<SharedItem>().toList();
  }

  Future<List<SharedItem>> listOnceByGroup(String groupId) async {
  final q = await _colGroup(groupId).orderBy('nextDueAt').get();
  return q.docs.map(_mapDocSafe).whereType<SharedItem>().toList();
  }

  Future<List<SharedItem>> listActiveByTypeOnce(
  String userPhone,
  String friendId, {
  required String type, // 'recurring' | 'subscription' | 'emi' | 'reminder'
  int? limit,
  }) async {
  Query<Map<String, dynamic>> q = _colFriend(userPhone, friendId)
      .where('type', isEqualTo: type)
      .where('rule.status', isEqualTo: 'active')
      .orderBy('nextDueAt');
  if (limit != null) q = q.limit(limit);
  final snap = await q.get();
  return snap.docs.map(_mapDocSafe).whereType<SharedItem>().toList();
  }

  // ---------------------------------------------------------------------------
  // STREAMS (SAFE & CROSS-SCOPE)
  // ---------------------------------------------------------------------------

  /// ✅ Unified stream across ALL friends & groups where the user is a participant.
  /// Requires: each doc sets `participants.userIds: [userPhone, ...]`.
  Stream<List<SharedItem>> streamAll(String userPhone) {
  final q = _db
      .collectionGroup('recurring')
      .where('participants.userIds', arrayContains: userPhone)
      .orderBy('nextDueAt');

  return q.snapshots().map((snap) {
  final list = snap.docs.map(_mapDocSafe).whereType<SharedItem>().toList();
  list.sort((a, b) {
  final ax = a.nextDueAt?.millisecondsSinceEpoch ?? 0;
  final bx = b.nextDueAt?.millisecondsSinceEpoch ?? 0;
  return ax.compareTo(bx);
  });
  return list;
  }).handleError((e, st) {
  if (kDebugMode) {
  print('[RecurringService] streamAll error: $e\n$st');
  }
  });
  }

  Stream<List<SharedItem>> streamByFriend(String userPhone, String friendId) {
  return _colFriend(userPhone, friendId)
      .orderBy('nextDueAt')
      .snapshots()
      .map((snap) => snap.docs.map(_mapDocSafe).whereType<SharedItem>().toList())
      .handleError((e, st) {
  if (kDebugMode) {
  print('[RecurringService] streamByFriend error: $e\n$st');
  }
  });
  }

  Stream<List<SharedItem>> streamByGroup(String groupId) {
  return _colGroup(groupId)
      .orderBy('nextDueAt')
      .snapshots()
      .map((snap) => snap.docs.map(_mapDocSafe).whereType<SharedItem>().toList())
      .handleError((e, st) {
  if (kDebugMode) {
  print('[RecurringService] streamByGroup error: $e\n$st');
  }
  });
  }

  Stream<List<SharedItem>> streamUpcoming(
  String userPhone,
  String friendId, {
  int limit = 20,
  }) {
  return _colFriend(userPhone, friendId)
      .where('rule.status', isEqualTo: 'active')
      .orderBy('nextDueAt')
      .limit(limit)
      .snapshots()
      .map((s) => s.docs.map(_mapDocSafe).whereType<SharedItem>().toList())
      .handleError((e, st) {
  if (kDebugMode) {
  print('[RecurringService] streamUpcoming error: $e\n$st');
  }
  });
  }

  Stream<List<SharedItem>> streamUpcomingInGroup(
  String groupId, {
  int limit = 20,
  }) {
  return _colGroup(groupId)
      .where('rule.status', isEqualTo: 'active')
      .orderBy('nextDueAt')
      .limit(limit)
      .snapshots()
      .map((s) => s.docs.map(_mapDocSafe).whereType<SharedItem>().toList())
      .handleError((e, st) {
  if (kDebugMode) {
  print('[RecurringService] streamUpcomingInGroup error: $e\n$st');
  }
  });
  }

  // ---------------------------------------------------------------------------
  // CRUD (FRIEND MIRRORED)  — existing, kept intact for back-compat
  // ---------------------------------------------------------------------------

  /// Adds an item to both users’ trees (same docId on both sides).
  Future<String> add(
  String userPhone,
  String friendId,
  SharedItem item, {
  bool mirrorToFriend = true,
  }) async {
  final data = _normalizePayloadForWrite(
  item: item,
  participants: [userPhone, friendId],
  );

  // Generate one id and fan-out
  final newRef = _colFriend(userPhone, friendId).doc();
  final id = newRef.id;

  if (!mirrorToFriend) {
  await newRef.set(data);
  return id;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: id,
  action: (batch, mine, peers) async {
  batch.set(mine, data);
  batch.set(peers, data);
  return null;
  },
  );

  return id;
  }

  /// Partial update (merge) + bumps updatedAt on both sides.
  Future<void> update(
  String userPhone,
  String friendId,
  SharedItem item, {
  bool mirrorToFriend = true,
  }) async {
  final data = _normalizeRuleForMerge(item.toJson())..['updatedAt'] = FieldValue.serverTimestamp();

  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, item.id).set(data, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: item.id,
  action: (batch, mine, peers) async {
  batch.set(mine, data, SetOptions(merge: true));
  batch.set(peers, data, SetOptions(merge: true));
  return null;
  },
  );
  }

  /// Lightweight patch for arbitrary fields (merge).
  Future<void> patch(
  String userPhone,
  String friendId,
  String itemId,
  Map<String, dynamic> payload, {
  bool mirrorToFriend = true,
  }) async {
  final data = {
  ...payload,
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, itemId).set(data, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: itemId,
  action: (batch, mine, peers) async {
  batch.set(mine, data, SetOptions(merge: true));
  batch.set(peers, data, SetOptions(merge: true));
  return null;
  },
  );
  }
  // Hard delete (scope-aware)
  Future<void> deleteScope(RecurringScope scope, String id) async {
    if (scope.isGroup) {
      await _docGroup(scope.groupId!, id).delete();
      return;
    }
    // friend scope → delete both mirrors atomically
    await withMirror(
      userPhone: scope.userPhone!,
      friendId: scope.friendId!,
      docId: id,
      action: (batch, mine, peers) async {
        batch.delete(mine);
        batch.delete(peers);
        return null;
      },
    );
  }


  /// Merge only rule.* fields. Optionally recompute nextDueAt immediately.
  Future<void> updateRulePartial({
  required String userPhone,
  required String friendId,
  required String itemId,
  required Map<String, dynamic> rulePatch, // e.g. {'frequency':'weekly','weekday':2}
  bool recomputeNextDue = false,
  DateTime? recomputeFrom,
  bool mirrorToFriend = true,
  }) async {
  final rp = _normalizeRulePatch(rulePatch);

  if (!recomputeNextDue) {
  await patch(userPhone, friendId, itemId, {'rule': rp}, mirrorToFriend: mirrorToFriend);
  return;
  }

  final item = await get(userPhone, friendId, itemId);
  if (item == null) return;

  final mergedRuleMap = item.rule.toJson()..remove('anchorDate');
  mergedRuleMap.addAll(rp);
  final mergedRule = RecurringRule.fromJson({
  ...mergedRuleMap,
  'anchorDate': rp['anchorDate'] ?? item.rule.anchorDate,
  });
  final next = computeNextDue(mergedRule, from: recomputeFrom);

  await patch(
  userPhone,
  friendId,
  itemId,
  {
  'rule': rp,
  'nextDueAt': Timestamp.fromDate(next),
  },
  mirrorToFriend: mirrorToFriend,
  );
  }

  Future<void> updateTitle(
  String userPhone,
  String friendId,
  String itemId,
  String newTitle, {
  bool mirrorToFriend = true,
  }) async {
  final payload = <String, dynamic>{
  'title': newTitle,
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, itemId).set(payload, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: itemId,
  action: (batch, mine, peers) async {
  batch.set(mine, payload, SetOptions(merge: true));
  batch.set(peers, payload, SetOptions(merge: true));
  return null;
  },
  );
  }

  Future<void> delete(
  String userPhone,
  String friendId,
  String id, {
  bool mirrorToFriend = true,
  }) async {
  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, id).delete();
  return;
  }
  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: id,
  action: (batch, mine, peers) async {
  batch.delete(mine);
  batch.delete(peers);
  return null;
  },
  );
  }

  Future<void> softDelete(
  String userPhone,
  String friendId,
  String id, {
  bool mirrorToFriend = true,
  }) async {
  final payload = {
  'rule': {'status': 'ended'},
  'archivedAt': FieldValue.serverTimestamp(),
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, id).set(payload, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: id,
  action: (batch, mine, peers) async {
  batch.set(mine, payload, SetOptions(merge: true));
  batch.set(peers, payload, SetOptions(merge: true));
  return null;
  },
  );
  }

  // ---------- Status helpers (mirrored) ----------
  Future<void> setStatus(
  String userPhone,
  String friendId,
  String id,
  String status, {
  bool mirrorToFriend = true,
  }) async {
  final payload = {
  'rule': {'status': status},
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, id).set(payload, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: id,
  action: (batch, mine, peers) async {
  batch.set(mine, payload, SetOptions(merge: true));
  batch.set(peers, payload, SetOptions(merge: true));
  return null;
  },
  );
  }

  Future<void> pause(String u, String f, String id) => setStatus(u, f, id, 'paused');
  Future<void> resume(String u, String f, String id) => setStatus(u, f, id, 'active');
  Future<void> end(String u, String f, String id) => setStatus(u, f, id, 'ended');

  // ---------------------------------------------------------------------------
  // CRUD (GROUP) — new API, single-copy (no mirroring)
  // ---------------------------------------------------------------------------

  Future<void> updateInGroup({
  required String groupId,
  required SharedItem item,
  }) async {
  final data = _normalizeRuleForMerge(item.toJson())..['updatedAt'] = FieldValue.serverTimestamp();
  await _docGroup(groupId, item.id).set(data, SetOptions(merge: true));
  }

  Future<void> patchInGroup({
  required String groupId,
  required String itemId,
  required Map<String, dynamic> payload,
  }) async {
  final data = {...payload, 'updatedAt': FieldValue.serverTimestamp()};
  await _docGroup(groupId, itemId).set(data, SetOptions(merge: true));
  }

  Future<void> updateRulePartialInGroup({
  required String groupId,
  required String itemId,
  required Map<String, dynamic> rulePatch,
  bool recomputeNextDue = false,
  DateTime? recomputeFrom,
  }) async {
  final rp = _normalizeRulePatch(rulePatch);

  if (!recomputeNextDue) {
  await patchInGroup(groupId: groupId, itemId: itemId, payload: {'rule': rp});
  return;
  }

  final item = await getInGroup(groupId, itemId);
  if (item == null) return;

  final mergedRuleMap = item.rule.toJson()..remove('anchorDate');
  mergedRuleMap.addAll(rp);
  final mergedRule = RecurringRule.fromJson({
  ...mergedRuleMap,
  'anchorDate': rp['anchorDate'] ?? item.rule.anchorDate,
  });
  final next = computeNextDue(mergedRule, from: recomputeFrom);

  await patchInGroup(groupId: groupId, itemId: itemId, payload: {
  'rule': rp,
  'nextDueAt': Timestamp.fromDate(next),
  });
  }

  Future<void> setStatusInGroup({
  required String groupId,
  required String itemId,
  required String status,
  }) =>
  patchInGroup(groupId: groupId, itemId: itemId, payload: {
  'rule': {'status': status},
  });

  Future<void> deleteInGroup({
  required String groupId,
  required String itemId,
  }) =>
  _docGroup(groupId, itemId).delete();

  Future<void> softDeleteInGroup({
  required String groupId,
  required String itemId,
  }) =>
  patchInGroup(groupId: groupId, itemId: itemId, payload: {
  'rule': {'status': 'ended'},
  'archivedAt': FieldValue.serverTimestamp(),
  });

  // ---------------------------------------------------------------------------
  // PARTICIPANTS / SHARING
  // ---------------------------------------------------------------------------

  /// Upserts participants.userIds. For friend path this mirrors both sides.
  Future<void> upsertParticipants({
  required RecurringScope scope,
  required String itemId,
  required List<String> userIds,
  }) async {
  final payload = {
  'participants': {'userIds': userIds},
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (scope.isGroup) {
  await _docFor(scope, itemId).set(payload, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: scope.userPhone!,
  friendId: scope.friendId!,
  docId: itemId,
  action: (batch, mine, peers) async {
  batch.set(mine, payload, SetOptions(merge: true));
  batch.set(peers, payload, SetOptions(merge: true));
  return null;
  },
  );
  }

  /// Add one participantId to participants.userIds.
  Future<void> addParticipant({
  required RecurringScope scope,
  required String itemId,
  required String userId,
  }) async {
  final ref = _docFor(scope, itemId);
  await ref.set({
  'participants': {
  'userIds': FieldValue.arrayUnion([userId]),
  },
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));

  // mirror peer if friend scope
  if (!scope.isGroup) {
  final peer = _docFriend(scope.friendId!, scope.userPhone!, itemId);
  await peer.set({
  'participants': {
  'userIds': FieldValue.arrayUnion([userId]),
  },
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));
  }
  }

  /// Remove a participantId.
  Future<void> removeParticipant({
  required RecurringScope scope,
  required String itemId,
  required String userId,
  }) async {
  final ref = _docFor(scope, itemId);
  await ref.set({
  'participants': {
  'userIds': FieldValue.arrayRemove([userId]),
  },
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));

  if (!scope.isGroup) {
  final peer = _docFriend(scope.friendId!, scope.userPhone!, itemId);
  await peer.set({
  'participants': {
  'userIds': FieldValue.arrayRemove([userId]),
  },
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));
  }
  }

  // ---------------------------------------------------------------------------
  // NOTIFY PREFS
  // ---------------------------------------------------------------------------

  Future<void> setNotifyPrefs({
  required String userPhone,
  required String friendId,
  required String itemId,
  required bool enabled,
  required int daysBefore,
  required String timeHHmm, // "HH:mm"
  required bool notifyBoth,
  bool mirrorToFriend = true,
  }) async {
  final payload = {
  'notify': {
  'enabled': enabled,
  'daysBefore': daysBefore,
  'time': timeHHmm,
  'both': notifyBoth,
  },
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (!mirrorToFriend) {
  await _docFriend(userPhone, friendId, itemId).set(payload, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: itemId,
  action: (batch, mine, peers) async {
  batch.set(mine, payload, SetOptions(merge: true));
  batch.set(peers, payload, SetOptions(merge: true));
  return null;
  },
  );
  }

  Future<void> setNotifyPrefsInGroup({
  required String groupId,
  required String itemId,
  required bool enabled,
  required int daysBefore,
  required String timeHHmm,
  required bool notifyAllMembers,
  }) async {
  final payload = {
  'notify': {
  'enabled': enabled,
  'daysBefore': daysBefore,
  'time': timeHHmm,
  'allMembers': notifyAllMembers,
  },
  'updatedAt': FieldValue.serverTimestamp(),
  };
  await _docGroup(groupId, itemId).set(payload, SetOptions(merge: true));
  }

  Future<Map<String, dynamic>?> getNotifyPrefs({
  required String userPhone,
  required String friendId,
  required String itemId,
  }) async {
  final snap = await _docFriend(userPhone, friendId, itemId).get();
  if (!snap.exists) return null;
  final data = snap.data();
  if (data == null) return null;
  final n = data['notify'];
  return (n is Map<String, dynamic>) ? n : null;
  }

  // Attach extra meta (friend path convenience)
  Future<void> patchMeta({
  required String userId,
  required String friendId,
  required String itemId,
  required Map<String, dynamic> meta,
  }) async {
  await _docFriend(userId, friendId, itemId).set({'meta': meta}, SetOptions(merge: true));
  }

  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------

  Query<Map<String, dynamic>> dueWindowQuery({
  required String userPhone,
  required String friendId,
  required DateTime startInclusive,
  required DateTime endExclusive,
  }) {
  return _colFriend(userPhone, friendId)
      .where('rule.status', isEqualTo: 'active')
      .where('nextDueAt', isGreaterThanOrEqualTo: Timestamp.fromDate(startInclusive))
      .where('nextDueAt', isLessThan: Timestamp.fromDate(endExclusive));
  }

  Query<Map<String, dynamic>> dueWindowQueryInGroup({
  required String groupId,
  required DateTime startInclusive,
  required DateTime endExclusive,
  }) {
  return _colGroup(groupId)
      .where('rule.status', isEqualTo: 'active')
      .where('nextDueAt', isGreaterThanOrEqualTo: Timestamp.fromDate(startInclusive))
      .where('nextDueAt', isLessThan: Timestamp.fromDate(endExclusive));
  }

  // ---------------------------------------------------------------------------
  // PAYMENTS / PROGRESSION
  // ---------------------------------------------------------------------------

  Future<void> markPaid(
  String userPhone,
  String friendId,
  String id, {
  double? amount,
  DateTime? paidAt,
  bool logPayment = true,
  bool mirrorToFriend = true,
  }) async {
  final now = paidAt ?? DateTime.now();

  final myRef = _docFriend(userPhone, friendId, id);
  final snap = await myRef.get();
  if (!snap.exists) return;

  final json = snap.data()!;
  final item = SharedItem.fromJson(snap.id, json);
  final next = computeNextDue(item.rule, from: now);

  if (!mirrorToFriend) {
  await _db.runTransaction((tx) async {
  tx.set(myRef, {
  'nextDueAt': Timestamp.fromDate(next),
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));

  if (logPayment) {
  final p = myRef.collection('payments').doc();
  tx.set(p, {
  'paidAt': Timestamp.fromDate(now),
  if (amount != null) 'amount': amount,
  'createdAt': FieldValue.serverTimestamp(),
  });
  }
  });
  return;
  }

  await _db.runTransaction((tx) async {
  final mine = _docFriend(userPhone, friendId, id);
  final peers = _docFriend(friendId, userPhone, id);

  final patch = {
  'nextDueAt': Timestamp.fromDate(next),
  'updatedAt': FieldValue.serverTimestamp(),
  };
  tx.set(mine, patch, SetOptions(merge: true));
  tx.set(peers, patch, SetOptions(merge: true));

  if (logPayment) {
  final pm = mine.collection('payments').doc();
  final pp = peers.collection('payments').doc();
  final pay = {
  'paidAt': Timestamp.fromDate(now),
  if (amount != null) 'amount': amount,
  'createdAt': FieldValue.serverTimestamp(),
  };
  tx.set(pm, pay);
  tx.set(pp, pay);
  }
  });
  }

  Future<void> markPaidInGroup({
  required String groupId,
  required String itemId,
  double? amount,
  DateTime? paidAt,
  bool logPayment = true,
  }) async {
  final now = paidAt ?? DateTime.now();

  final ref = _docGroup(groupId, itemId);
  final snap = await ref.get();
  if (!snap.exists) return;

  final json = snap.data()!;
  final item = SharedItem.fromJson(snap.id, json);
  final next = computeNextDue(item.rule, from: now);

  await _db.runTransaction((tx) async {
  tx.set(ref, {
  'nextDueAt': Timestamp.fromDate(next),
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));

  if (logPayment) {
  final p = ref.collection('payments').doc();
  tx.set(p, {
  'paidAt': Timestamp.fromDate(now),
  if (amount != null) 'amount': amount,
  'createdAt': FieldValue.serverTimestamp(),
  });
  }
  });
  }

  Future<void> recomputeNextDueAndUpdate(
  String userPhone,
  String friendId,
  String id, {
  DateTime? from,
  bool mirrorToFriend = true,
  }) async {
  final ref = _docFriend(userPhone, friendId, id);
  final snap = await ref.get();
  if (!snap.exists) return;

  final item = SharedItem.fromJson(snap.id, snap.data()!);
  final next = computeNextDue(item.rule, from: from);

  final payload = {
  'nextDueAt': Timestamp.fromDate(next),
  'updatedAt': FieldValue.serverTimestamp(),
  };

  if (!mirrorToFriend) {
  await ref.set(payload, SetOptions(merge: true));
  return;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: id,
  action: (batch, mine, peers) async {
  batch.set(mine, payload, SetOptions(merge: true));
  batch.set(peers, payload, SetOptions(merge: true));
  return null;
  },
  );
  }

  Future<void> recomputeNextDueAndUpdateInGroup({
  required String groupId,
  required String itemId,
  DateTime? from,
  }) async {
  final ref = _docGroup(groupId, itemId);
  final snap = await ref.get();
  if (!snap.exists) return;

  final item = SharedItem.fromJson(snap.id, snap.data()!);
  final next = computeNextDue(item.rule, from: from);

  await ref.set({
  'nextDueAt': Timestamp.fromDate(next),
  'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));
  }

  // ---------------------------------------------------------------------------
  // LOAN LINKING (friend & group)
  // ---------------------------------------------------------------------------

  Future<String> attachLoanToFriend({
  required String userPhone,
  required String friendId,
  required LoanModel loan,
  bool mirrorToFriend = true,
  }) async {
  final payload = _loanToRecurringPayload(
  loan: loan,
  participants: [userPhone, friendId],
  );

  final newRef = _colFriend(userPhone, friendId).doc();
  final id = newRef.id;

  if (!mirrorToFriend) {
  await newRef.set(payload);
  return id;
  }

  await withMirror(
  userPhone: userPhone,
  friendId: friendId,
  docId: id,
  action: (batch, mine, peers) async {
  batch.set(mine, payload);
  batch.set(peers, payload);
  return null;
  },
  );

  return id;
  }

  Future<String> attachLoanToGroup({
  required String groupId,
  required LoanModel loan,
  required List<String> participantUserIds,
  }) async {
  final payload = _loanToRecurringPayload(
  loan: loan,
  participants: participantUserIds,
  );
  final ref = _colGroup(groupId).doc();
  await ref.set(payload);
  return ref.id;
  }

  Future<String?> attachLoanById({
  required String userPhone,
  required String friendId,
  required String loanId,
  bool mirrorToFriend = true,
  }) async {
  final loan = await LoanService().getById(loanId);
  if (loan == null) return null;
  return attachLoanToFriend(
  userPhone: userPhone,
  friendId: friendId,
  loan: loan,
  mirrorToFriend: mirrorToFriend,
  );
  }

  // ---------------------------------------------------------------------------
  // DATE MATH
  // ---------------------------------------------------------------------------

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  /// Computes the next due date **at date precision**.
  /// - If `from` is **before or equal to anchorDate**, we return `anchorDate` (first due).
  /// - Otherwise we advance according to frequency.
  DateTime computeNextDue(RecurringRule rule, {DateTime? from}) {
  final DateTime base = _dateOnly(from ?? DateTime.now());
  final DateTime anchor = _dateOnly(rule.anchorDate);

  // Respect the very first due occurrence.
  if (!anchor.isBefore(base)) return anchor;

  switch (rule.frequency) {
  case 'daily':
  return base.add(const Duration(days: 1));

  case 'weekly':
  // Dart weekday: 1=Mon..7=Sun
  final int target = (rule.weekday ?? rule.anchorDate.weekday).clamp(1, 7);
  final int current = base.weekday;
  int delta = (target - current) % 7;
  if (delta <= 0) delta += 7; // always move forward
  return base.add(Duration(days: delta));

  case 'custom':
  final int n = (rule.intervalDays ?? 1).clamp(1, 365);
  final diff = base.difference(anchor).inDays;
  final steps = (diff / n).ceil();
  return anchor.add(Duration(days: steps * n));

  case 'yearly':
  final int m = rule.anchorDate.month;
  final int d = rule.anchorDate.day.clamp(1, 28);
  DateTime candidate = DateTime(base.year, m, d);
  if (!candidate.isAfter(base)) {
  candidate = DateTime(base.year + 1, m, d);
  }
  return candidate;

  case 'monthly':
  default:
  final int day = (rule.dueDay ?? rule.anchorDate.day).clamp(1, 28);
  DateTime candidate = DateTime(base.year, base.month, day);
  if (candidate.isAfter(base)) return candidate;
  final bool dec = base.month == 12;
  final int y = dec ? base.year + 1 : base.year;
  final int m = dec ? 1 : base.month + 1;
  return DateTime(y, m, day);
  }
  }

  DateTime _computeNextMonthly(DateTime base, int desiredDay) {
  final int safeDay = desiredDay.clamp(1, 28);
  final DateTime candidate = DateTime(base.year, base.month, safeDay);
  if (candidate.isAfter(base)) return candidate;
  final bool december = base.month == 12;
  final int y = december ? base.year + 1 : base.year;
  final int m = december ? 1 : base.month + 1;
  return DateTime(y, m, safeDay);
  }

  // ---------------------------------------------------------------------------
  // INTERNAL NORMALIZERS
  // ---------------------------------------------------------------------------

  Map<String, dynamic> _normalizePayloadForWrite({
  required SharedItem item,
  required List<String> participants,
  }) {
  final data = item.toJson();

  data['createdAt'] ??= FieldValue.serverTimestamp();
  data['updatedAt'] = FieldValue.serverTimestamp();

  // Normalize rule
  final rule = (data['rule'] as Map?)?.cast<String, dynamic>() ?? {};
  final ad = rule['anchorDate'];
  if (ad is String) {
  try {
  rule['anchorDate'] = Timestamp.fromDate(DateTime.parse(ad));
  } catch (_) {}
  } else if (ad is DateTime) {
  rule['anchorDate'] = Timestamp.fromDate(ad);
  }
  rule['status'] ??= 'active';
  data['rule'] = rule;

  // participants mirror
  final participantsTop = (data['participants'] as Map?)?.cast<String, dynamic>() ?? {};
  participantsTop['userIds'] = participants;
  data['participants'] = participantsTop;

  // nextDueAt default if missing → respect anchor as first due if in the future/today
  data['nextDueAt'] ??= Timestamp.fromDate(
  computeNextDue(item.rule, from: item.rule.anchorDate),
  );

  return data;
  }

  Map<String, dynamic> _normalizeRuleForMerge(Map<String, dynamic> j) {
  final map = {...j};
  map['updatedAt'] = FieldValue.serverTimestamp();

  if (map['rule'] is Map) {
  final rule = (map['rule'] as Map).cast<String, dynamic>();
  final ad = rule['anchorDate'];
  if (ad is String) {
  try {
  rule['anchorDate'] = Timestamp.fromDate(DateTime.parse(ad));
  } catch (_) {}
  } else if (ad is DateTime) {
  rule['anchorDate'] = Timestamp.fromDate(ad);
  }
  map['rule'] = rule;
  }
  return map;
  }

  Map<String, dynamic> _normalizeRulePatch(Map<String, dynamic> patch) {
  final rp = {...patch};
  final ad = rp['anchorDate'];
  if (ad is DateTime) rp['anchorDate'] = Timestamp.fromDate(ad);
  return rp;
  }

  Map<String, dynamic> _loanToRecurringPayload({
  required LoanModel loan,
  required List<String> participants,
  }) {
  final now = DateTime.now();

  final double amount = (loan.emi ?? loan.minDue ?? 0).toDouble();
  final DateTime? modelNext = loan.nextPaymentDate(now: now);
  final int dom = (loan.paymentDayOfMonth ?? modelNext?.day ?? now.day).clamp(1, 28);

  final DateTime anchor = DateTime(now.year, now.month, dom);
  final DateTime nextDue = _computeNextMonthly(now, dom);

  return <String, dynamic>{
  'title': loan.title,
  // Keep both keys for back-compat
  'kind': 'emi',
  'type': 'emi',
  'amount': amount,
  'note': loan.note,
  'createdAt': FieldValue.serverTimestamp(),
  'updatedAt': FieldValue.serverTimestamp(),
  'nextDueAt': Timestamp.fromDate(modelNext ?? nextDue),
  'rule': {
  'status': 'active',
  'frequency': 'monthly',
  'dueDay': dom,
  'anchorDate': Timestamp.fromDate(anchor),
  },
  'participants': {
  'userIds': participants,
  },
  'link': {
  'type': 'loan',
  'loanId': loan.id,
  'userId': loan.userId,
  },
  'meta': {
  'lenderType': loan.lenderType,
  if (loan.lenderName != null) 'lenderName': loan.lenderName,
  if (loan.interestRate != null) 'interestRate': loan.interestRate,
  if (loan.accountLast4 != null) 'accountLast4': loan.accountLast4,
  },
  };
  }
}
