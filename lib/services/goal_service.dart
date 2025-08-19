import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/goal_model.dart';

class GoalService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> getGoalsCollection(String userId) {
    return _firestore.collection('users').doc(userId).collection('goals');
  }

  // Add a new goal (auto-generate Firestore doc ID)
  Future<String> addGoal(String userId, GoalModel goal) async {
    final docRef = getGoalsCollection(userId).doc(); // Get a new doc ref (auto ID)
    final goalToSave = goal.copyWith(id: docRef.id); // Locally set id for usage
    await docRef.set(goalToSave.toJson());
    return docRef.id;
  }

  // Update an existing goal
  Future<void> updateGoal(String userId, GoalModel goal) async {
    await getGoalsCollection(userId).doc(goal.id).update(goal.toJson());
  }

  // Delete a goal
  Future<void> deleteGoal(String userId, String goalId) async {
    await getGoalsCollection(userId).doc(goalId).delete();
  }

  // Get all goals (ordered by targetDate)
  Future<List<GoalModel>> getGoals(String userId) async {
    final snapshot = await getGoalsCollection(userId)
        .orderBy('targetDate')
        .get();
    return snapshot.docs
        .map((doc) => GoalModel.fromDoc(doc))
        .toList();
  }

  // Stream of all goals (for real-time UI, optional)
  Stream<List<GoalModel>> goalsStream(String userId) {
    return getGoalsCollection(userId)
        .orderBy('targetDate')
        .snapshots()
        .map((snap) =>
        snap.docs.map((doc) => GoalModel.fromDoc(doc)).toList());
  }
}
