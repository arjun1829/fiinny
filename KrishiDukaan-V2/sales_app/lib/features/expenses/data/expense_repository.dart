import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/constants/firestore_keys.dart';
import 'bill_image.dart';
import 'expense.dart';

class ExpenseRepository {
  ExpenseRepository({FirebaseFirestore? db, FirebaseStorage? storage})
    : _db = db ?? FirebaseFirestore.instance,
      _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFirestore _db;
  final FirebaseStorage _storage;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.salesExpenses);

  /// The rep's claims in an inclusive IST date range, newest spend first.
  Future<List<Expense>> inRange(
    String uid,
    String fromDate,
    String toDate,
  ) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where('date', isGreaterThanOrEqualTo: fromDate)
        .where('date', isLessThanOrEqualTo: toDate)
        .orderBy('date', descending: true)
        .get();
    return snap.docs.map(Expense.fromDoc).toList();
  }

  /// Creates the claim first, then uploads the bill under the new document's
  /// id. Doing it in that order means the storage path is derived from the
  /// claim rather than a random name, so an orphaned upload can always be
  /// traced back — and a failed upload still leaves a usable claim behind
  /// instead of losing what the rep typed.
  Future<String> create(
    String uid,
    ExpenseInput input, {
    BillImage? bill,
  }) async {
    final now = FieldValue.serverTimestamp();
    final ref = await _col.add({
      'salesExecutiveId': uid,
      'date': input.date,
      'category': input.category.wire,
      'amount': input.amount,
      if (input.description?.trim().isNotEmpty ?? false)
        'description': input.description!.trim(),
      if (input.daySessionId != null) 'daySessionId': input.daySessionId,
      'status': 'PENDING',
      'createdAt': now,
      'updatedAt': now,
    });

    if (bill != null) {
      await attachBill(uid: uid, expenseId: ref.id, bill: bill);
    }
    return ref.id;
  }

  Future<void> update(String expenseId, ExpenseInput input) async {
    await _col.doc(expenseId).update({
      'date': input.date,
      'category': input.category.wire,
      'amount': input.amount,
      'description': (input.description?.trim().isNotEmpty ?? false)
          ? input.description!.trim()
          : FieldValue.delete(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> attachBill({
    required String uid,
    required String expenseId,
    required BillImage bill,
  }) async {
    // putData rather than putFile: the bill arrives as bytes, so the same call
    // works on web, where there is no dart:io File to hand to putFile.
    final path = 'sales-expenses/$uid/$expenseId${bill.extension}';
    final ref = _storage.ref(path);
    await ref.putData(
      bill.bytes,
      SettableMetadata(contentType: bill.contentType),
    );
    final url = await ref.getDownloadURL();
    await _col.doc(expenseId).update({
      'billUrl': url,
      'billPath': path,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Withdraws a claim. Allowed only while PENDING, both here and in the rules.
  Future<void> delete(Expense expense) async {
    if (expense.billPath != null) {
      // A dangling bill image would outlive the claim it belongs to, so remove
      // it first — but never let a storage miss block withdrawing the claim.
      try {
        await _storage.ref(expense.billPath!).delete();
      } catch (_) {}
    }
    await _col.doc(expense.id).delete();
  }
}
