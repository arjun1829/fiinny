import 'package:cloud_firestore/cloud_firestore.dart';

class DiagnosisRepository {
  final String userId;
  DiagnosisRepository(this.userId);

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _runs =>
      _db.collection('users').doc(userId).collection('diagnosis_runs');

  DocumentReference<Map<String, dynamic>> get _latest =>
      _db.collection('users').doc(userId).collection('diagnosis_latest').doc('summary');

  /// Start a new run; returns runId
  Future<String> startRun({required int windowDays}) async {
    final doc = await _runs.add({
      'status': 'running',
      'startedAt': FieldValue.serverTimestamp(),
      'finishedAt': null,
      'windowDays': windowDays,
      'scannedCount': 0,
      'counts': {
        'hidden': 0, 'subs': 0, 'forexIntl': 0, 'forexFees': 0, 'loansSuggested': 0, 'salaryDetected': false,
      },
      'version': 1,
    });
    return doc.id;
  }

  Future<void> setScanned(String runId, int count) {
    return _runs.doc(runId).update({'scannedCount': count});
  }

  /// Bulk save international transactions
  Future<void> saveIntl(String runId, List<Map<String, dynamic>> intl) async {
    if (intl.isEmpty) return;
    final batch = _db.batch();
    final col = _runs.doc(runId).collection('intl_txns');
    for (final m in intl) {
      final id = (m['expenseId'] as String?) ?? col.doc().id;
      batch.set(col.doc(id), {
        'expenseRef': m['expenseRef'],
        'date': m['date'],
        'fxCur': m['fxCur'],
        'fxAmt': m['fxAmt'],
        'inrAmt': m['inrAmt'],
        'last4': m['last4'],
        'availableInr': m['availableInr'],
        'creditLimitInr': m['creditLimitInr'],
        'utilizationPct': m['utilizationPct'],
        'note': m['note'],
      }, SetOptions(merge: true));
    }
    await batch.commit();
  }

  /// Bulk save forex fee lines
  Future<void> saveForexFees(String runId, List<Map<String, dynamic>> fees) async {
    if (fees.isEmpty) return;
    final batch = _db.batch();
    final col = _runs.doc(runId).collection('forex_fees');
    for (final m in fees) {
      final id = (m['expenseId'] as String?) ?? col.doc().id;
      batch.set(col.doc(id), {
        'expenseRef': m['expenseRef'],
        'date': m['date'],
        'inrAmt': m['inrAmt'],
        'note': m['note'],
      }, SetOptions(merge: true));
    }
    await batch.commit();
  }

  /// Optional: attach references to hidden charges / subs / loan suggestions
  Future<void> saveRefs(String runId, List<Map<String, dynamic>> refs) async {
    if (refs.isEmpty) return;
    final batch = _db.batch();
    final col = _runs.doc(runId).collection('refs');
    for (final r in refs) {
      final id = (r['id'] as String?) ?? col.doc().id;
      batch.set(col.doc(id), {
        'type': r['type'],
        'targetRef': r['targetRef'], // e.g. path string
      });
    }
    await batch.commit();
  }

  Future<void> finishRun({
    required String runId,
    required int scanned,
    required Map<String, dynamic> counts,
    String? notes,
  }) async {
    final data = {
      'status': 'complete',
      'finishedAt': FieldValue.serverTimestamp(),
      'scannedCount': scanned,
      'counts': counts,
      if (notes != null) 'notes': notes,
    };
    await _runs.doc(runId).update(data);

    // Mirror to "diagnosis_latest"
    await _latest.set({
      ...data,
      'startedAt': FieldValue.serverTimestamp(), // approximate for latest card
      'lastRunId': runId,
    }, SetOptions(merge: true));
  }

  Future<DocumentSnapshot<Map<String, dynamic>>?> latest() async {
    final doc = await _latest.get();
    return doc.exists ? doc : null;
  }

  /// Optional: keep only last N runs
  Future<void> pruneOld({int keep = 10}) async {
    final snap = await _runs.orderBy('startedAt', descending: true).get();
    if (snap.docs.length <= keep) return;
    final batch = _db.batch();
    for (int i = keep; i < snap.docs.length; i++) {
      batch.delete(snap.docs[i].reference);
    }
    await batch.commit();
  }
}
