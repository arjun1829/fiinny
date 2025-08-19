import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/income_item.dart';

class IncomeService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> getIncomesCollection(String userId) {
    return _firestore.collection('users').doc(userId).collection('incomes');
  }

  // ✅ NEW: Get all incomes for dashboard
  Future<List<IncomeItem>> getIncomes(String userId) async {
    final snapshot = await getIncomesCollection(userId).get();
    return snapshot.docs.map((doc) => IncomeItem.fromJson(doc.data())).toList();
  }

  // Add Income
  Future<String> addIncome(String userId, IncomeItem income) async {
    final docRef = getIncomesCollection(userId).doc();
    final incomeWithId = income.copyWith(id: docRef.id);
    await docRef.set(incomeWithId.toJson());
    return docRef.id;
  }

  Future<void> updateIncome(String userId, IncomeItem income) async {
    await getIncomesCollection(userId).doc(income.id).update(income.toJson());
  }

  Future<void> deleteIncome(String userId, String incomeId) async {
    await getIncomesCollection(userId).doc(incomeId).delete();
  }

  // Get Incomes Stream
  Stream<List<IncomeItem>> getIncomesStream(String userId) {
    return getIncomesCollection(userId)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snapshot) =>
        snapshot.docs.map((doc) => IncomeItem.fromJson(doc.data())).toList());
  }

  // 🚀 NEW: Get incomes for a specific date range (inclusive start, exclusive end)
  Future<List<IncomeItem>> getIncomesInDateRange(
      String userId, {
        required DateTime start,
        required DateTime end,
      }) async {
    final snapshot = await getIncomesCollection(userId)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('date', isLessThan: Timestamp.fromDate(end))
        .get();
    return snapshot.docs.map((doc) => IncomeItem.fromJson(doc.data())).toList();
  }
}
