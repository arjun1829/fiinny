// lib/services/review_queue_service.dart
import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';

class ReviewQueueService {
  final FirebaseFirestore _fs = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _queueCol(String userId) =>
      _fs.collection('users').doc(userId).collection('review_queue');

  CollectionReference<Map<String, dynamic>> _dedupeCol(String userId) =>
      _fs.collection('users').doc(userId).collection('dedupe');

  /// Save a low-confidence parse to the review queue (idempotent by gmailMessageId).
  Future<void> saveLowConfidence({
    required String userId,
    required String gmailMessageId,
    required Map<String, dynamic> parsed, // fields from EmailParser
    required Map<String, dynamic> raw,    // {subject, from, snippet, body, internalDate}
    required String naturalKey,
  }) async {
    final doc = _queueCol(userId).doc(gmailMessageId);
    final snap = await doc.get();
    if (snap.exists) return;

    await doc.set({
      'gmailMessageId': gmailMessageId,
      'parsed': parsed,
      'raw': raw,
      'naturalKey': naturalKey,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  /// Stream pending items for UI.
  Stream<QuerySnapshot<Map<String, dynamic>>> streamPending(String userId) {
    return _queueCol(userId)
        .where('status', isEqualTo: 'pending')
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  /// Approve: write Expense/Income, create dedupe token, then delete from queue.
  Future<void> approve({
    required String userId,
    required String gmailMessageId,
  }) async {
    final ref = _queueCol(userId).doc(gmailMessageId);
    final snap = await ref.get();
    if (!snap.exists) return;

    final data = snap.data()!;
    final parsed = Map<String, dynamic>.from(data['parsed'] ?? {});
    final raw = Map<String, dynamic>.from(data['raw'] ?? {});
    final naturalKey = (data['naturalKey'] as String?) ?? '';

    final direction = (parsed['direction'] as String?) ?? '';
    final category  = (parsed['category']  as String?) ?? 'Other';
    final amount    = (parsed['amount']    as num?)?.toDouble() ?? 0.0;
    final note      = (parsed['note']      as String?) ?? (raw['snippet'] as String? ?? '');
    final bankLogo  = parsed['bankLogo'] as String?;
    final last4     = parsed['cardLast4'] as String?;
    final isBill    = category == 'Credit Card Bill';

    final millis = (raw['internalDate'] as int?) ?? DateTime.now().millisecondsSinceEpoch;
    final date = DateTime.fromMillisecondsSinceEpoch(millis);

    if (amount <= 0 || (direction != 'debit' && direction != 'credit')) {
      // Invalid — just delete the queue item.
      await ref.delete();
      return;
    }

    if (direction == 'debit') {
      final expense = ExpenseItem(
        id: '',
        type: category,
        amount: amount,
        note: note,
        date: date,
        friendIds: const [],
        groupId: null,
        payerId: userId,
        cardType: (category == 'Credit Card' || category == 'Card Spend') ? 'Credit Card'
            : (category == 'Debit Card' ? 'Debit Card' : null),
        cardLast4: last4,
        isBill: isBill,
        bankLogo: bankLogo,
      );
      await ExpenseService().addExpense(userId, expense);
    } else {
      final income = IncomeItem(
        id: '',
        type: category == 'Other' ? 'Credit' : category,
        amount: amount,
        note: note,
        date: date,
        source: 'Email',
        bankLogo: bankLogo,
      );
      await IncomeService().addIncome(userId, income);
    }

    // Mark dedupe
    final id = base64Url.encode(utf8.encode(naturalKey)).replaceAll('=', '');
    await _dedupeCol(userId).doc(id).set({
      'key': naturalKey,
      'source': 'gmail-review',
      'gmailMessageId': gmailMessageId,
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    // Remove from queue
    await ref.delete();
  }

  /// Reject: remove from queue (or mark as rejected).
  Future<void> reject({
    required String userId,
    required String gmailMessageId,
  }) async {
    await _queueCol(userId).doc(gmailMessageId).delete();
  }
}
