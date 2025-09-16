// lib/services/ingest_index_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// A tiny idempotency/dup-index layer:
/// Each parsed transaction is mapped to a stable `key` (see tx_key.dart),
/// and we try to "claim" it here. If the doc already exists, we skip writing
/// the duplicate expense/income.
///
/// Firestore layout:
/// ingest_index/{userPhone}/keys/{key}  -> { createdAt, source }
class IngestIndexService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  /// Try to claim a transaction key for this user.
  /// Returns true if we created the key (i.e., first writer wins),
  /// false if the key already existed (duplicate from SMS/Gmail/backfill).
  Future<bool> claim(
      String userPhone,
      String key, {
        required String source, // e.g. "sms" | "gmail"
      }) async {
    final ref = _db
        .collection('ingest_index')
        .doc(userPhone)
        .collection('keys')
        .doc(key);

    try {
      // Use a transaction for "check-then-create" atomicity.
      return await _db.runTransaction<bool>((tx) async {
        final snap = await tx.get(ref);
        if (snap.exists) {
          // Someone (maybe the other pipeline) already claimed it.
          return false;
        }
        tx.set(ref, {
          'source': source,
          'createdAt': FieldValue.serverTimestamp(),
        });
        return true;
      });
    } catch (e) {
      // If something races or fails, do a final sanity check:
      try {
        final exists = (await ref.get()).exists;
        return !exists ? false : false; // if exists => duplicate
      } catch (_) {
        // On unexpected errors, be conservative and do NOT double-write.
        return false;
      }
    }
  }

  /// Optional: prune very old keys to keep the index small.
  /// Call this occasionally (e.g., once a week) if needed.
  Future<void> pruneOldKeys({
    required String userPhone,
    int olderThanDays = 120,
    int batchSize = 200,
  }) async {
    final cutoff = DateTime.now().subtract(Duration(days: olderThanDays));
    final query = _db
        .collection('ingest_index')
        .doc(userPhone)
        .collection('keys')
        .where('createdAt', isLessThan: Timestamp.fromDate(cutoff))
        .limit(batchSize);

    final snap = await query.get();
    if (snap.docs.isEmpty) return;

    final batch = _db.batch();
    for (final d in snap.docs) {
      batch.delete(d.reference);
    }
    await batch.commit();
  }
}
