// lib/services/txn_mirror_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class TxnMirrorService {
  TxnMirrorService(this.userDocId, {FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final String userDocId;
  final FirebaseFirestore _db;

  // Read unified txns
  CollectionReference<Map<String, dynamic>> get _txCol =>
      _db.collection('users').doc(userDocId).collection('transactions');

  // ✅ Write to legacy, app-friendly paths
  CollectionReference<Map<String, dynamic>> get _expCol =>
      _db.collection('users').doc(userDocId).collection('expenses');
  CollectionReference<Map<String, dynamic>> get _incCol =>
      _db.collection('users').doc(userDocId).collection('incomes');

  // Cursor
  DocumentReference<Map<String, dynamic>> get _cursorDoc => _db
      .collection('users')
      .doc(userDocId)
      .collection('ingest_index')
      .doc('mirror');

  Future<int> mirrorRecent({int pageSize = 400, int maxPages = 10}) async {
    assert(pageSize > 0 && pageSize <= 500);
    int totalMirrored = 0;

    Timestamp? cursor = await _loadLastMirroredAt();
    int pages = 0;

    Future<QuerySnapshot<Map<String, dynamic>>> _runPage(Timestamp? c) {
      Query<Map<String, dynamic>> q =
          _txCol.orderBy('updatedAt', descending: false).limit(pageSize);
      if (c != null) q = q.where('updatedAt', isGreaterThan: c);
      return q.get();
    }

    // ---- first attempt with current cursor
    var snap = await _runPage(cursor);

    // ---- SAFETY: if empty but we know there are transactions, reset cursor once
    if (snap.docs.isEmpty && cursor != null) {
      final newest =
          await _txCol.orderBy('updatedAt', descending: true).limit(1).get();
      if (newest.docs.isNotEmpty) {
        final newestUpdatedAt = newest.docs.first.data()['updatedAt'];
        if (newestUpdatedAt is Timestamp &&
            newestUpdatedAt.compareTo(cursor) <= 0) {
          // debugPrint('[TxnMirror] cursor ${cursor.toDate()} is too new; resetting.');
          cursor = null;
          snap = await _runPage(null);
        }
      }
    }

    while (pages < maxPages) {
      pages++;
      if (snap.docs.isEmpty) {
        // if (pages == 1) debugPrint('[TxnMirror] nothing new to mirror.');
        break;
      }

      int mirroredThisPage = 0;
      Timestamp? newestSeenUpdatedAt;
      final wb = _db.batch();

      for (final d in snap.docs) {
        final data = d.data();

        final updatedAt = _asTimestamp(data['updatedAt']);
        if (updatedAt != null &&
            (newestSeenUpdatedAt == null ||
                updatedAt.compareTo(newestSeenUpdatedAt) > 0)) {
          newestSeenUpdatedAt = updatedAt;
        }

        final rawStatus = (data['status'] ?? '').toString().toUpperCase();
        final isPostedLike = rawStatus.isEmpty ||
            rawStatus == 'POSTED' ||
            rawStatus == 'SUCCESS' ||
            rawStatus == 'COMPLETED' ||
            rawStatus == 'PAID';
        if (!isPostedLike) continue;

        final dirRaw = (data['direction'] ?? '').toString().toUpperCase();
        final normDir = (dirRaw == 'DR')
            ? 'DEBIT'
            : (dirRaw == 'CR')
                ? 'CREDIT'
                : dirRaw;
        final amount = _asDouble(data['amount']);
        if ((normDir != 'DEBIT' && normDir != 'CREDIT') ||
            amount == null ||
            amount <= 0) continue;

        final cat = (data['category'] ?? 'General').toString();
        final merchant = (data['merchantName'] ?? '').toString().trim();
        final note = merchant.isNotEmpty
            ? merchant
            : (data['source']?.toString() ?? 'UnifiedTxn');

        final when = _bestTime(data['occurredAt'],
            fallback1: data['postedAt'], fallback2: data['updatedAt']);

        final txKey = (data['txKey'] ?? d.id).toString();
        final docId = 'tx_$txKey';

        if (normDir == 'DEBIT') {
          wb.set(
              _db
                  .collection('users')
                  .doc(userDocId)
                  .collection('expenses')
                  .doc(docId),
              {
                'id': docId,
                'type': cat,
                'amount': amount,
                'note': note,
                'date': Timestamp.fromDate(when),
                'source': (data['source'] ?? 'UnifiedTxn').toString(),
              },
              SetOptions(merge: true));
          mirroredThisPage++;
        } else {
          wb.set(
              _db
                  .collection('users')
                  .doc(userDocId)
                  .collection('incomes')
                  .doc(docId),
              {
                'id': docId,
                'type': cat,
                'amount': amount,
                'note': note,
                'date': Timestamp.fromDate(when),
                'source': (data['source'] ?? 'UnifiedTxn').toString(),
              },
              SetOptions(merge: true));
          mirroredThisPage++;
        }
      }

      if (mirroredThisPage > 0) await wb.commit();

      if (newestSeenUpdatedAt != null) {
        await _cursorDoc.set({
          'lastMirroredAt': newestSeenUpdatedAt,
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        cursor = newestSeenUpdatedAt;
        // debugPrint('[TxnMirror] checkpoint -> ${newestSeenUpdatedAt.toDate()}');
      }

      totalMirrored += mirroredThisPage;

      if (snap.docs.length < pageSize) break;
      snap = await _runPage(cursor); // next page
    }

    // debugPrint('[TxnMirror] mirrored total: $totalMirrored (pages=$pages)');
    return totalMirrored;
  }

  Future<Timestamp?> _loadLastMirroredAt() async {
    try {
      final d = await _cursorDoc.get();
      final v = d.data()?['lastMirroredAt'];
      if (v is Timestamp) return v;
    } catch (_) {}
    return null;
  }

  DateTime _bestTime(dynamic primary, {dynamic fallback1, dynamic fallback2}) {
    final tPrimary = _asTimestamp(primary);
    if (tPrimary != null) return tPrimary.toDate();
    final t1 = _asTimestamp(fallback1);
    if (t1 != null) return t1.toDate();
    final t2 = _asTimestamp(fallback2);
    if (t2 != null) return t2.toDate();
    return DateTime.now();
  }

  Timestamp? _asTimestamp(dynamic v) {
    if (v is Timestamp) return v;
    if (v is DateTime) return Timestamp.fromDate(v);
    if (v is int) return Timestamp.fromMillisecondsSinceEpoch(v);
    return null;
  }

  double? _asDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) {
      final s = v.replaceAll(',', '').trim();
      return double.tryParse(s);
    }
    return null;
  }
}
