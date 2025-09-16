import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import 'brain_enricher_service.dart';
import 'brain_constants.dart';

class BrainBackfillService {
  final _fs = FirebaseFirestore.instance;
  final _enricher = BrainEnricherService();

  /// Process all expenses & incomes for a user.
  /// If [force] is false, only items missing brain fields or with older version get updated.
  Future<Map<String,int>> backfillUser(String userPhone, {bool force = false, int pageSize = 300}) async {
    int updatedExpenses = 0, updatedIncomes = 0;

    // EXPENSES
    DocumentSnapshot? cursor;
    while (true) {
      Query q = _fs.collection('users').doc(userPhone).collection('expenses')
          .orderBy('date').limit(pageSize);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;

      final batch = _fs.batch();
      for (final d in snap.docs) {
        final e = ExpenseItem.fromFirestore(d);
        final data = d.data() as Map<String, dynamic>;
        final int? v = (data['brainVersion'] as num?)?.toInt();

        if (force || v == null || v < kBrainVersion) {
          final upd = _enricher.buildExpenseBrainUpdate(e);
          batch.set(d.reference, upd, SetOptions(merge: true));
          updatedExpenses++;
        }
      }
      await batch.commit();
      cursor = snap.docs.last;
    }

    // INCOMES
    cursor = null;
    while (true) {
      Query q = _fs.collection('users').doc(userPhone).collection('incomes')
          .orderBy('date').limit(pageSize);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;

      final batch = _fs.batch();
      for (final d in snap.docs) {
        final i = IncomeItem.fromFirestore(d);
        final data = d.data() as Map<String, dynamic>;
        final int? v = (data['brainVersion'] as num?)?.toInt();

        if (force || v == null || v < kBrainVersion) {
          final upd = _enricher.buildIncomeBrainUpdate(i);
          batch.set(d.reference, upd, SetOptions(merge: true));
          updatedIncomes++;
        }
      }
      await batch.commit();
      cursor = snap.docs.last;
    }

    return {'expenses': updatedExpenses, 'incomes': updatedIncomes};
  }
}
