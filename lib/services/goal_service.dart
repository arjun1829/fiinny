// lib/services/goal_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/goal_model.dart';

class GoalService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // ---- Base collections ------------------------------------------------------

  CollectionReference<Map<String, dynamic>> getGoalsCollection(String userId) {
    return _firestore.collection('users').doc(userId).collection('goals');
  }

  /// Strongly-typed collection (optional convenience).
  CollectionReference<GoalModel> _typedCol(String userId) {
    return getGoalsCollection(userId).withConverter<GoalModel>(
      fromFirestore: (snap, _) => GoalModel.fromDoc(snap),
      toFirestore: (goal, _) => goal.toJson(),
    );
  }

  // ---- Internal helpers ------------------------------------------------------

  Map<String, dynamic> _withUpdatedAt(Map<String, dynamic> data) {
    return {
      ...data,
      'updatedAt': FieldValue.serverTimestamp(),
    };
  }

  // ---- CRUD ------------------------------------------------------------------

  /// Add a new goal. Auto-generates an ID, sets createdAt/updatedAt.
  Future<String> addGoal(String userId, GoalModel goal) async {
    final docRef = getGoalsCollection(userId).doc(); // auto ID
    final toSave = goal.copyWith(id: docRef.id);

    final data = toSave.toJson(setServerCreatedAtIfNull: true);
    data['updatedAt'] = FieldValue.serverTimestamp(); // ensure both stamps exist

    await docRef.set(data, SetOptions(merge: true));
    return docRef.id;
  }

  /// Replace the goal (full update).
  Future<void> updateGoal(String userId, GoalModel goal) async {
    final data = _withUpdatedAt(
      goal.toJson(setServerCreatedAtIfNull: false),
    );
    await getGoalsCollection(userId).doc(goal.id).update(data);
  }

  /// Partial update (patch). Nulls are stripped.
  Future<void> updateFields(String userId, String goalId, Map<String, dynamic> fields) async {
    final update = _withUpdatedAt(fields);
    update.removeWhere((k, v) => v == null);
    await getGoalsCollection(userId).doc(goalId).update(update);
  }

  /// Delete a goal.
  Future<void> deleteGoal(String userId, String goalId) async {
    await getGoalsCollection(userId).doc(goalId).delete();
  }

  /// Get all goals ordered by targetDate.
  Future<List<GoalModel>> getGoals(String userId) async {
    final snapshot = await getGoalsCollection(userId)
        .orderBy('targetDate')
        .get();
    return snapshot.docs.map((doc) => GoalModel.fromDoc(doc)).toList();
  }

  /// Realtime stream ordered by targetDate.
  Stream<List<GoalModel>> goalsStream(String userId) {
    return getGoalsCollection(userId)
        .orderBy('targetDate')
        .snapshots()
        .map((snap) => snap.docs.map((doc) => GoalModel.fromDoc(doc)).toList());
  }

  // ---- Getters / Queries -----------------------------------------------------

  /// Get a single goal by id (typed).
  Future<GoalModel?> getGoalById(String userId, String goalId) async {
    final snap = await _typedCol(userId).doc(goalId).get();
    return snap.data();
  }

  /// Stream only ACTIVE, non-archived goals, nearest deadline first.
  Stream<List<GoalModel>> activeGoalsStream(String userId) {
    return getGoalsCollection(userId)
        .where('status', isEqualTo: GoalStatus.active.name)
        .where('archived', isEqualTo: false)
        .orderBy('targetDate')
        .snapshots()
        .map((snap) => snap.docs.map((d) => GoalModel.fromDoc(d)).toList());
  }

  /// Stream goals due within [days] (inclusive), not archived.
  /// ⚠️ You may need a composite index (Firestore will prompt in console).
  Stream<List<GoalModel>> dueWithinStream(String userId, {int days = 30}) {
    final until = DateTime.now().add(Duration(days: days));
    return getGoalsCollection(userId)
        .where('archived', isEqualTo: false)
        .where('targetDate', isLessThanOrEqualTo: Timestamp.fromDate(until))
        .orderBy('targetDate')
        .snapshots()
        .map((snap) => snap.docs.map((d) => GoalModel.fromDoc(d)).toList());
  }

  /// Flexible query with filters & sorting.
  Future<List<GoalModel>> queryGoals(
      String userId, {
        GoalStatus? status,
        bool? archived,
        String orderBy = 'targetDate',
        bool descending = false,
        int? limit,
        DocumentSnapshot<Map<String, dynamic>>? startAfter,
      }) async {
    Query<Map<String, dynamic>> q = getGoalsCollection(userId);
    if (status != null) q = q.where('status', isEqualTo: status.name);
    if (archived != null) q = q.where('archived', isEqualTo: archived);
    q = q.orderBy(orderBy, descending: descending);
    if (startAfter != null) q = q.startAfterDocument(startAfter);
    if (limit != null) q = q.limit(limit);

    final snap = await q.get();
    return snap.docs.map((d) => GoalModel.fromDoc(d)).toList();
  }

  // ---- Atomic progress updates ----------------------------------------------

  /// Atomically increment `savedAmount`. Optionally clamp to [0, targetAmount].
  Future<double> incrementSavedAmount(
      String userId,
      String goalId,
      double delta, {
        bool clampToTarget = true,
      }) async {
    return await _firestore.runTransaction<double>((txn) async {
      final ref = getGoalsCollection(userId).doc(goalId);
      final snap = await txn.get(ref);
      if (!snap.exists) throw Exception('Goal not found');

      final goal = GoalModel.fromDoc(snap as DocumentSnapshot<Map<String, dynamic>>);
      var newSaved = goal.savedAmount + delta;

      if (clampToTarget) {
        if (newSaved < 0) newSaved = 0;
        if (goal.targetAmount > 0 && newSaved > goal.targetAmount) {
          newSaved = goal.targetAmount;
        }
      }

      txn.update(ref, _withUpdatedAt({'savedAmount': newSaved}));
      return newSaved;
    });
  }

  /// Non-atomic, exact set of savedAmount.
  Future<void> setSavedAmount(String userId, String goalId, double amount) async {
    await updateFields(userId, goalId, {'savedAmount': amount});
  }

  // ---- Status / lifecycle helpers -------------------------------------------

  Future<void> setStatus(String userId, String goalId, GoalStatus status) async {
    await updateFields(userId, goalId, {'status': status.name});
  }

  Future<void> pauseGoal(String userId, String goalId) =>
      setStatus(userId, goalId, GoalStatus.paused);

  Future<void> resumeGoal(String userId, String goalId) =>
      setStatus(userId, goalId, GoalStatus.active);

  /// Mark goal completed; sets status, completedAt, and (optionally) snaps savedAmount to targetAmount.
  Future<void> markCompleted(
      String userId,
      String goalId, {
        bool snapSavedToTarget = true,
      }) async {
    await _firestore.runTransaction<void>((txn) async {
      final ref = getGoalsCollection(userId).doc(goalId);
      final snap = await txn.get(ref);
      if (!snap.exists) return;

      final data = snap.data() as Map<String, dynamic>;
      final target = (data['targetAmount'] is num) ? (data['targetAmount'] as num).toDouble() : 0.0;

      final update = _withUpdatedAt({
        'status': GoalStatus.completed.name,
        'completedAt': FieldValue.serverTimestamp(),
      });

      if (snapSavedToTarget && target > 0) {
        update['savedAmount'] = target;
      }

      txn.update(ref, update);
    });
  }

  Future<void> archiveGoal(String userId, String goalId) async {
    await updateFields(userId, goalId, {
      'archived': true,
      'status': GoalStatus.archived.name,
    });
  }

  Future<void> unarchiveGoal(String userId, String goalId) async {
    await updateFields(userId, goalId, {
      'archived': false,
      'status': GoalStatus.active.name,
    });
  }

  // ---- Goal meta helpers -----------------------------------------------------

  Future<void> setGoalType(String userId, String goalId, GoalType type, {String? recurrence}) async {
    await updateFields(userId, goalId, {
      'goalType': type.name,
      'recurrence': recurrence,
    });
  }

  Future<void> setImageUrl(String userId, String goalId, String? imageUrl) async {
    await updateFields(userId, goalId, {'imageUrl': imageUrl});
  }

  // ---- Arrays: milestones & dependencies ------------------------------------

  Future<void> addMilestone(String userId, String goalId, String milestone) async {
    await updateFields(userId, goalId, {
      'milestones': FieldValue.arrayUnion([milestone]),
    });
  }

  Future<void> removeMilestone(String userId, String goalId, String milestone) async {
    await updateFields(userId, goalId, {
      'milestones': FieldValue.arrayRemove([milestone]),
    });
  }

  Future<void> addDependency(String userId, String goalId, String dep) async {
    await updateFields(userId, goalId, {
      'dependencies': FieldValue.arrayUnion([dep]),
    });
  }

  Future<void> removeDependency(String userId, String goalId, String dep) async {
    await updateFields(userId, goalId, {
      'dependencies': FieldValue.arrayRemove([dep]),
    });
  }

  // ---- Convenience analytics -------------------------------------------------

  /// Counts per status (client side).
  Future<Map<String, int>> statusCounts(String userId) async {
    final list = await getGoals(userId);
    int active = 0, completed = 0, paused = 0, archived = 0;
    for (final g in list) {
      switch (g.status) {
        case GoalStatus.active:
          active++;
          break;
        case GoalStatus.completed:
          completed++;
          break;
        case GoalStatus.paused:
          paused++;
          break;
        case GoalStatus.archived:
          archived++;
          break;
      }
    }
    return {
      'active': active,
      'completed': completed,
      'paused': paused,
      'archived': archived,
    };
  }

  /// Simple local search by title (fetches then filters).
  Future<List<GoalModel>> searchByTitle(String userId, String query) async {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return getGoals(userId);
    final list = await getGoals(userId);
    return list.where((g) => g.title.toLowerCase().contains(q)).toList();
  }
}
