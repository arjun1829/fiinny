// services/bill_service.dart

import '../models/bill_model.dart';

class BillService {
  // Fetch all bills for a user (stub, implement with Firestore/local DB)
  Future<List<BillModel>> getUserBills(String userId) async {
    // TODO: Implement Firestore/local fetch logic
    return [];
  }

  // Save or update a bill for a user
  Future<void> saveBill(String userId, BillModel bill) async {
    // TODO: Implement Firestore/local save logic
  }

  // Mark a bill as paid (set isPaid and paidDate)
  Future<void> markBillPaid(String userId, String billId, DateTime paidDate) async {
    // TODO: Implement Firestore/local update logic
  }

  // Delete a bill for a user
  Future<void> deleteBill(String userId, String billId) async {
    // TODO: Implement Firestore/local delete logic
  }
}
