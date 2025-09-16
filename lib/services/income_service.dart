// lib/services/income_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/income_item.dart';

class IncomeService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // incomes/<userId>/items/*
  CollectionReference<Map<String, dynamic>> getIncomesCollection(String userId) {
    return _firestore.collection('users').doc(userId).collection('incomes');
  }

  // List all incomes for dashboard
  Future<List<IncomeItem>> getIncomes(String userId) async {
    final snapshot = await getIncomesCollection(userId)
        .orderBy('date', descending: true)
        .get();
    return snapshot.docs.map((doc) => IncomeItem.fromJson(doc.data())).toList();
  }

  // Add income
  Future<String> addIncome(String userId, IncomeItem income) async {
    final docRef = getIncomesCollection(userId).doc();
    final withId = income.copyWith(id: docRef.id);
    await docRef.set(withId.toJson());
    return docRef.id;
  }

  Future<void> updateIncome(String userId, IncomeItem income) async {
    await getIncomesCollection(userId).doc(income.id).update(income.toJson());
  }

  Future<void> deleteIncome(String userId, String incomeId) async {
    await getIncomesCollection(userId).doc(incomeId).delete();
  }

  Stream<List<IncomeItem>> getIncomesStream(String userId) {
    return getIncomesCollection(userId)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => IncomeItem.fromJson(d.data())).toList());
  }

  Future<List<IncomeItem>> getIncomesInDateRange(
      String userId, {
        required DateTime start,
        required DateTime end,
      }) async {
    final snap = await getIncomesCollection(userId)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('date', isLessThan: Timestamp.fromDate(end))
        .orderBy('date', descending: true)
        .get();
    return snap.docs.map((d) => IncomeItem.fromJson(d.data())).toList();
  }
}
