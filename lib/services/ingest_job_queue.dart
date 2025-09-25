// lib/services/ingest_job_queue.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class IngestJobQueue {
  /// Enqueue an LLM categorization job.
  ///
  /// Backward compatible:
  /// - Pass either [userId] (preferred) or [userPhone] (legacy). One is required.
  /// - Provide [direction], [docCollection], [docId] (and optionally [docPath])
  ///   so the worker can update the correct transaction doc without querying.
  static Future<void> enqueue({
    // Preferred
    String? userId,

    // Legacy (kept for existing call sites)
    String? userPhone,

    // Required job content
    required String txKey,
    required String rawText,
    required double amount,
    String currency = 'INR',
    required DateTime timestamp,
    required String source, // 'sms' | 'email' | 'upi' | 'manual'

    // Optional routing for write-back
    String? direction,          // 'debit' | 'credit'
    String? docCollection,      // 'expenses' | 'incomes'
    String? docId,              // deterministic id you wrote (ing_***)
    String? docPath,            // full path: users/<id>/<collection>/<docId>

    // Misc
    bool enabled = true,        // feature flag to gate rollout
    Map<String, dynamic>? extra,
  }) async {
    if (!enabled) return;

    final uid = (userId ?? userPhone) ?? '';
    if (uid.isEmpty) {
      throw ArgumentError('IngestJobQueue.enqueue: userId/userPhone is required.');
    }

    // If caller gave collection+docId but not docPath, derive it.
    final derivedDocPath = (docPath == null && docCollection != null && docId != null)
        ? 'users/$uid/$docCollection/$docId'
        : docPath;

    final jobRef = FirebaseFirestore.instance.doc('users/$uid/ingest_jobs/$txKey');

    // Idempotent write (merge) keyed by txKey.
    await jobRef.set({
      // Core
      'txKey': txKey,
      'text': rawText,
      'amount': amount,
      'currency': currency,
      'timestamp': timestamp.millisecondsSinceEpoch,
      'source': source,

      // Status lifecycle (worker moves queued -> working -> done/error)
      'status': 'queued',
      'retries': 0,
      'createdAt': FieldValue.serverTimestamp(),

      // Worker outputs (left null for the function to fill)
      'suggestedBy': null,
      'suggestedAt': null,
      'suggestedCategory': null,
      'suggestedSubcategory': null,
      'suggestedMerchant': null,
      'suggestedConfidence': null,
      'suggestedLatencyMs': null,

      // Routing hints to patch the correct transaction doc
      'route': {
        'userId': uid,
        if (direction != null) 'direction': direction,
        if (docCollection != null) 'docCollection': docCollection,
        if (docId != null) 'docId': docId,
        if (derivedDocPath != null) 'docPath': derivedDocPath,
      },

      if (extra != null) 'extra': extra,
    }, SetOptions(merge: true));
  }

  /// Optional client-side progress markers (useful for ad-hoc tools).
  static Future<void> markStarted({
    required String userId,
    required String txKey,
  }) {
    final ref = FirebaseFirestore.instance.doc('users/$userId/ingest_jobs/$txKey');
    return ref.set({
      'status': 'working',
      'startedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  static Future<void> markDone({
    required String userId,
    required String txKey,
    Map<String, dynamic>? suggestionFields,
  }) {
    final ref = FirebaseFirestore.instance.doc('users/$userId/ingest_jobs/$txKey');
    return ref.set({
      'status': 'done',
      'completedAt': FieldValue.serverTimestamp(),
      if (suggestionFields != null) ...suggestionFields,
    }, SetOptions(merge: true));
  }

  static Future<void> markError({
    required String userId,
    required String txKey,
    String? message,
  }) {
    final ref = FirebaseFirestore.instance.doc('users/$userId/ingest_jobs/$txKey');
    return ref.set({
      'status': 'error',
      'error': message,
      'completedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}
