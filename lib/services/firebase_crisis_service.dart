import 'package:cloud_firestore/cloud_firestore.dart';

class FirebaseCrisisService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<void> saveCrisisPlan({
    required String userId,
    required double weeklyLimit,
    required DateTime startDate,
    required bool isActive,
  }) async {
    await _firestore.collection('survival_mode').doc(userId).set({
      'userId': userId,
      'weeklyLimit': weeklyLimit,
      'startDate': startDate.toIso8601String(),
      'isActive': isActive,
    });
  }

  Future<Map<String, dynamic>?> fetchCrisisPlan(String userId) async {
    final doc = await _firestore.collection('survival_mode').doc(userId).get();
    return doc.exists ? doc.data() : null;
  }
}
