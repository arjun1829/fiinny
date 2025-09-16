// lib/services/review_queue_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/ingest_draft_model.dart';
import '../brain/brain_enricher_service.dart';

/// Draft schema (per /users/{u}/ingest_drafts/{txKey})
/// {
///   userId, key, direction: 'debit' | 'credit',
///   amount?: number (INR), currency?: 'INR' | 'USD' | ...,
///   time: Timestamp,    // canonical event time
///   note: string, bank?: string, last4?: string,
///   fxOriginal?: { currency: 'USD', amount: 23.6 } // optional raw FX
///   brain?: {...},      // category/tags/confidence/merchant/etc.
///   sources: [ {type:'sms'|'gmail'|..., raw:..., at:Timestamp, ...}, ...]
///   status: 'new' | 'posted' | 'rejected'
///   createdAt, updatedAt
///   finalDocPath?: 'users/{u}/expenses/{id}' | 'users/{u}/incomes/{id}'
/// }
class ReviewQueueService {
  ReviewQueueService._();
  static final ReviewQueueService instance = ReviewQueueService._();

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _drafts(String userId) =>
      _db.collection('users').doc(userId).collection('ingest_drafts');

  DocumentReference<Map<String, dynamic>> _meta(String userId) =>
      _db.collection('users').doc(userId).collection('ingest_queue').doc('meta');

  // ---------------------------------------------------------------------------
  // UPSERT / MERGE
  // ---------------------------------------------------------------------------

  /// Idempotent upsert by txKey (doc id). Merges sources + brain.
  /// - amount can be null (e.g., only USD present in SMS). UI can fill later.
  /// - Pass fxOriginal when you detected non-INR like {currency:'USD', amount:23.6}
  Future<void> upsertDraft({
    required String userId,
    required String txKey,
    required String direction, // 'debit' | 'credit'
    double? amount,
    DateTime? date,            // event time; if null, uses now
    required String note,
    String? currency = 'INR',
    String? bank,
    String? last4,
    Map<String, dynamic>? brain,
    Map<String, dynamic>? fxOriginal,
    Map<String, dynamic>? sourceRecord, // e.g. {type:'sms', raw:body, at:Timestamp.now(), address:...}
  }) async {
    final ref = _drafts(userId).doc(txKey);
    final now = DateTime.now();

    final payload = <String, dynamic>{
      'userId': userId,
      'key': txKey,
      'direction': direction,
      if (amount != null) 'amount': amount,
      if (currency != null) 'currency': currency,
      'time': Timestamp.fromDate(date ?? now),
      'note': note,
      if (bank != null) 'bank': bank,
      if (last4 != null) 'last4': last4,
      if (fxOriginal != null) 'fxOriginal': fxOriginal,
      'updatedAt': FieldValue.serverTimestamp(),
      if (sourceRecord != null) 'sources': FieldValue.arrayUnion([sourceRecord]),
    };

    await ref.set(payload, SetOptions(merge: true));

    // Ensure status/createdAt exist (only if missing)
    final snap = await ref.get();
    if (!snap.exists || (snap.data()?['status'] == null)) {
      await ref.set({
        'status': 'new',
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    }

    // Merge brain hints under a nested field
    if (brain != null && brain.isNotEmpty) {
      await ref.set({'brain': brain}, SetOptions(merge: true));
    }
  }

  /// Lightweight meta hook for badges/refresh triggers.
  Future<void> onDraftUpsert(String userId, String txKey) async {
    await _meta(userId).set({
      'lastUpsertAt': FieldValue.serverTimestamp(),
      'lastKey': txKey,
    }, SetOptions(merge: true));
  }

  // ---------------------------------------------------------------------------
  // READ / STREAM / COUNT
  // ---------------------------------------------------------------------------

  /// New items first (ordered by `time`).
  Stream<List<IngestDraft>> pendingStream(String userId) {
    return _drafts(userId)
        .where('status', isEqualTo: 'new')
        .orderBy('time', descending: true)
        .snapshots()
        .map((s) => s.docs
        .map((d) => IngestDraft.fromFirestore(d.data(), d.id))
        .toList());
  }

  Future<int> pendingCount(String userId) async {
    final q = await _drafts(userId).where('status', isEqualTo: 'new').get();
    return q.docs.length;
  }

  Future<IngestDraft?> getDraft(String userId, String txKey) async {
    final snap = await _drafts(userId).doc(txKey).get();
    if (!snap.exists) return null;
    return IngestDraft.fromFirestore(snap.data()!, snap.id);
  }

  // ---------------------------------------------------------------------------
  // EDIT (used by editor sheet)
  // ---------------------------------------------------------------------------

  /// Update fields on a draft before approval. Any null arg is ignored.
  Future<void> updateDraft(
      String userId,
      String txKey, {
        double? amount,
        DateTime? date,
        String? direction, // 'debit' | 'credit'
        String? note,
        String? bank,
        String? last4,
        String? category, // stored under brain.category
      }) async {
    final ref = _drafts(userId).doc(txKey);
    final updates = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (amount != null) updates['amount'] = amount;
    if (date != null) updates['time'] = Timestamp.fromDate(date);
    if (direction != null) updates['direction'] = direction;
    if (note != null) updates['note'] = note;
    if (bank != null) updates['bank'] = bank;
    if (last4 != null) updates['last4'] = last4;
    if (category != null && category.isNotEmpty) {
      updates['brain'] = {'category': category};
    }
    await ref.set(updates, SetOptions(merge: true));
  }

  // ---------------------------------------------------------------------------
  // APPROVE / POST
  // ---------------------------------------------------------------------------

  /// Approve one draft -> write to /expenses or /incomes, then mark posted.
  /// If amount is missing, returns false (UI should request INR amount).
  Future<bool> approve(String userId, String txKey) async {
    final ref = _drafts(userId).doc(txKey);

    return await _db.runTransaction<bool>((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) throw StateError('Draft not found');
      final draft = IngestDraft.fromFirestore(snap.data()!, snap.id);

      if (draft.status == 'posted') return true; // already done
      if (draft.amount == null) return false;    // require INR amount for both directions

      if (draft.direction == 'debit') {
        // -> expenses
        final expRef = _db.collection('users').doc(userId).collection('expenses').doc();
        final expense = ExpenseItem(
          id: expRef.id,
          type: (draft.brain?['category'] as String?) ?? 'Expense',
          amount: draft.amount!,
          note: draft.note,
          date: draft.date,
          payerId: userId,
          cardLast4: draft.last4,
        );

        tx.set(expRef, expense.toJson());
        final brain = BrainEnricherService().buildExpenseBrainUpdate(expense);
        tx.set(expRef, brain, SetOptions(merge: true));

        tx.update(ref, {
          'status': 'posted',
          'finalDocPath': expRef.path,
          'postedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        return true;
      } else {
        // -> incomes
        final incRef = _db.collection('users').doc(userId).collection('incomes').doc();
        final income = IncomeItem(
          id: incRef.id,
          type: (draft.brain?['category'] as String?) ?? 'Income',
          amount: draft.amount!,
          note: draft.note,
          date: draft.date,
          source: 'Review',
        );

        tx.set(incRef, income.toJson());
        final brain = BrainEnricherService().buildIncomeBrainUpdate(income);
        tx.set(incRef, brain, SetOptions(merge: true));

        tx.update(ref, {
          'status': 'posted',
          'finalDocPath': incRef.path,
          'postedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        return true;
      }
    });
  }

  /// Approve many in one go; returns (posted, blockedMissingAmount).
  Future<(int posted, int blockedMissingAmount)> approveMany(
      String userId, List<String> txKeys) async {
    int ok = 0, blocked = 0;
    for (final key in txKeys) {
      final success = await approve(userId, key);
      if (success) {
        ok++;
      } else {
        blocked++;
      }
    }
    return (ok, blocked);
  }

  // ---------------------------------------------------------------------------
  // REJECT / DELETE
  // ---------------------------------------------------------------------------

  Future<void> reject(String userId, String txKey) async {
    await _drafts(userId).doc(txKey).update({
      'status': 'rejected',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> delete(String userId, String txKey) async {
    await _drafts(userId).doc(txKey).delete();
  }
}
