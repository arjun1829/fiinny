// services/bill_service.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/bill_model.dart';

class BillService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _bills(String userId) =>
      _db.collection('users').doc(userId).collection('bills');

  // Fetch all bills for a user (stub, implement with Firestore/local DB)
  Future<List<BillModel>> getUserBills(String userId) async {
    try {
      final snap = await _bills(userId).get();
      return snap.docs.map((doc) => BillModel.fromJson(doc.data())).toList();
    } catch (e) {
      return [];
    }
  }

  // Save or update a bill for a user
  Future<void> saveBill(String userId, BillModel bill) async {
    await _bills(userId).doc(bill.id).set(bill.toJson());
  }

  // Mark a bill as paid (set isPaid and paidDate)
  Future<void> markBillPaid(
      String userId, String billId, DateTime paidDate) async {
    await _bills(userId).doc(billId).update({
      'isPaid': true,
      'paidDate': paidDate.toIso8601String(),
    });
  }

  // Delete a bill for a user
  Future<void> deleteBill(String userId, String billId) async {
    await _bills(userId).doc(billId).delete();
  }
}
