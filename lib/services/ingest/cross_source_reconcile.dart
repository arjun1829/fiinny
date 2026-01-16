// lib/services/ingest/cross_source_reconcile.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Fuzzy reconcile between sources (SMS/Gmail/etc.) so one canonical txn is created.
///
/// Strategy (upgraded):
/// 1) Query existing txns for the user & direction within a time window (±windowMinutes)
/// 2) Client-side filter by amount tolerance (default 0% = exact)
/// 3) Score candidates with signals:
///    - txKey exact match (hard win)
///    - last4, merchantKey, upiVpa, issuerBank, instrument, network
///    - time proximity
/// 4) If best match passes minimum score → merge `sourceRecord` & return existing docId
/// 5) Else return null (caller should create new doc)
///
/// Backwards-compatible with previous signature; new optional params are safe defaults.
class CrossSourceReconcile {
  /// Default time window in minutes for candidate lookups.
  static const int _defaultWindowMinutes = 15;

  /// Soft minimum score to accept a merge (tune if needed).
  static const int _minAcceptScore = 2;

  /// Try to find an existing txn doc id in {users/<u>/(expenses|incomes)} that matches fuzzily.
  ///
  /// Returns existing docId if merged; else null.
  static Future<String?> maybeMerge({
    required String userId,
    required String direction, // 'debit' or 'credit'
    required double amount,
    required DateTime timestamp,

    // Existing hints (old API)
    String? cardLast4,
    String? merchantKey,

    // NEW (optional) hints to improve matching/merge quality
    String? txKey, // if parsers computed one
    String? upiVpa,
    String? issuerBank,
    String?
        instrument, // UPI/IMPS/NEFT/RTGS/ATM/POS/Credit Card/Debit Card/Wallet/NetBanking
    String? network, // VISA/MASTERCARD/RUPAY/AMEX/DINERS
    double amountTolerancePct = 0, // 0 = exact; e.g., 0.5 for ±0.5%

    int? windowMinutes, // override default 15m
    String? docPathIfCreating, // unused but kept for compatibility
    Map<String, dynamic>? newSourceMeta, // sourceRecord to merge in
  }) async {
    final minutes = windowMinutes ?? _defaultWindowMinutes;

    final coll = FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection(direction == 'debit' ? 'expenses' : 'incomes');

    final start = timestamp.subtract(Duration(minutes: minutes));
    final end = timestamp.add(Duration(minutes: minutes));

    // Query by time window only (keeps index pressure low & supports client-side tolerance).
    QuerySnapshot<Map<String, dynamic>>? q;
    try {
      q = await coll
          .where('date', isGreaterThanOrEqualTo: start)
          .where('date', isLessThanOrEqualTo: end)
          .limit(50)
          .get(const GetOptions(source: Source.serverAndCache));
    } catch (_) {
      q = null;
    }

    if (q == null || q.docs.isEmpty) return null;

    // Compute amount tolerance band (if any).
    final double tol = (amountTolerancePct <= 0)
        ? 0.0
        : (amount * (amountTolerancePct.abs() / 100.0));
    final double minAmt = amount - tol;
    final double maxAmt = amount + tol;

    // Filter by amount (exact or within tolerance).
    final candidates = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    for (final d in q.docs) {
      final data = d.data();
      final amt =
          (data['amount'] is num) ? (data['amount'] as num).toDouble() : null;
      if (amt == null) continue;
      if (tol == 0.0) {
        if (amt == amount) candidates.add(d);
      } else {
        if (amt >= minAmt && amt <= maxAmt) candidates.add(d);
      }
    }
    if (candidates.isEmpty) return null;

    // Fast path: direct txKey match (if both sides provide).
    if (txKey != null && txKey.trim().isNotEmpty) {
      final exact = candidates.firstWhere(
        (d) =>
            ((d.data()['txKey'] ?? d.data()['sourceRecord']?['txKey'])
                    ?.toString() ??
                '') ==
            txKey,
        orElse: () => null as dynamic,
      );
      await _mergeSourceRecord(exact.reference, newSourceMeta);
      return exact.id;
    }

    // Score each candidate; pick best.
    QueryDocumentSnapshot<Map<String, dynamic>>? best;
    int bestScore = -9999;
    Map<String, dynamic>? bestHints;

    for (final d in candidates) {
      final data = d.data();

      // Root fields / fallbacks from sourceRecord
      final String? cLast4 =
          (data['cardLast4'] ?? data['sourceRecord']?['last4'])?.toString();
      final String mk =
          ((data['merchantKey'] ?? data['sourceRecord']?['merchant']) ?? '')
              .toString()
              .toUpperCase();
      final String vpa =
          (data['upiVpa'] ?? data['sourceRecord']?['upiVpa'])?.toString() ?? '';
      final String bank =
          (data['issuerBank'] ?? data['sourceRecord']?['issuerBank'])
                  ?.toString() ??
              '';
      final String inst =
          (data['instrument'] ?? data['sourceRecord']?['instrument'])
                  ?.toString() ??
              '';
      final String netw =
          (data['instrumentNetwork'] ?? data['sourceRecord']?['network'])
                  ?.toString() ??
              '';
      final String candTxKey =
          (data['txKey'] ?? data['sourceRecord']?['txKey'])?.toString() ?? '';
      final DateTime? dt = _safeDate(data['date']);
      if (dt == null) continue;

      int score = 0;
      final hints = <String, dynamic>{};

      // Strongest: txKey equality (if both present)
      if (txKey != null &&
          txKey.isNotEmpty &&
          candTxKey.isNotEmpty &&
          candTxKey == txKey) {
        score += 100; // hard win
        hints['txKey'] = true;
      }

      // cardLast4
      if ((cardLast4 ?? '').isNotEmpty &&
          (cLast4 ?? '').isNotEmpty &&
          cLast4 == cardLast4) {
        score += 5;
        hints['last4'] = true;
      }

      // merchantKey
      if ((merchantKey ?? '').isNotEmpty &&
          mk.isNotEmpty &&
          mk == (merchantKey ?? '').toUpperCase()) {
        score += 3;
        hints['merchantKey'] = true;
      }

      // upiVpa
      if ((upiVpa ?? '').isNotEmpty &&
          vpa.isNotEmpty &&
          vpa.toUpperCase() == (upiVpa ?? '').toUpperCase()) {
        score += 2;
        hints['upiVpa'] = true;
      }

      // issuerBank
      if ((issuerBank ?? '').isNotEmpty &&
          bank.isNotEmpty &&
          bank.toUpperCase() == (issuerBank ?? '').toUpperCase()) {
        score += 1;
        hints['issuerBank'] = true;
      }

      // instrument
      if ((instrument ?? '').isNotEmpty &&
          inst.isNotEmpty &&
          inst.toUpperCase() == (instrument ?? '').toUpperCase()) {
        score += 1;
        hints['instrument'] = true;
      }

      // network
      if ((network ?? '').isNotEmpty &&
          netw.isNotEmpty &&
          netw.toUpperCase() == (network ?? '').toUpperCase()) {
        score += 1;
        hints['network'] = true;
      }

      // Time closeness bonus: up to +10, proportional to proximity inside window
      final diffMs =
          (dt.millisecondsSinceEpoch - timestamp.millisecondsSinceEpoch).abs();
      final windowMs = minutes * 60 * 1000;
      final timeScore =
          ((windowMs - diffMs.clamp(0, windowMs)) / windowMs * 10).round();
      score += timeScore;
      hints['timeScore'] = timeScore;

      if (score > bestScore) {
        best = d;
        bestScore = score;
        bestHints = hints;
      }
    }

    // Accept only if score above threshold (avoid random merges)
    if (best == null || bestScore < _minAcceptScore) return null;

    // Merge metadata and backfill some root fields if missing.
    await _mergeSourceRecord(best.reference, newSourceMeta, hints: bestHints);

    return best.id;
  }

  /// Merge `sourceRecord` maps idempotently and optionally backfill root fields
  /// (merchantKey, upiVpa, cardLast4, issuerBank, instrument, network, txKey)
  static Future<void> _mergeSourceRecord(
    DocumentReference<Map<String, dynamic>> ref,
    Map<String, dynamic>? newSourceMeta, {
    Map<String, dynamic>? hints,
  }) async {
    if (newSourceMeta == null || newSourceMeta.isEmpty) return;

    await FirebaseFirestore.instance.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) {
        // If somehow missing, just set sourceRecord and minimal roots
        tx.set(
            ref,
            {
              'sourceRecord': _mergeSourceMaps({}, newSourceMeta),
            },
            SetOptions(merge: true));
        return;
      }

      final existing = Map<String, dynamic>.from(snap.data() ?? {});
      final prevSrc = (existing['sourceRecord'] is Map)
          ? Map<String, dynamic>.from(existing['sourceRecord'])
          : <String, dynamic>{};
      final mergedSrc = _mergeSourceMaps(prevSrc, newSourceMeta);

      final update = <String, dynamic>{
        'sourceRecord': mergedSrc,
      };

      // Backfill convenience roots if absent (do not overwrite)
      void putIfMissing(String rootKey, dynamic value) {
        if (value == null) return;
        if (!existing.containsKey(rootKey) ||
            existing[rootKey] == null ||
            existing[rootKey].toString().isEmpty) {
          update[rootKey] = value;
        }
      }

      putIfMissing('merchantKey',
          newSourceMeta['merchant'] ?? newSourceMeta['merchantKey']);
      putIfMissing('cardLast4', newSourceMeta['last4']);
      putIfMissing('upiVpa', newSourceMeta['upiVpa']);
      putIfMissing('issuerBank', newSourceMeta['issuerBank']);
      putIfMissing('instrument', newSourceMeta['instrument']);
      putIfMissing('instrumentNetwork', newSourceMeta['network']);
      putIfMissing('txKey', newSourceMeta['txKey']);

      if (hints != null && hints.isNotEmpty) {
        update['sourceRecord.mergeHints'] = hints; // debug/analysis only
      }

      tx.set(ref, update, SetOptions(merge: true));
    });
  }

  /// Merge two sourceRecord maps; union `sources[]`, preserve/override recent fields sensibly.
  static Map<String, dynamic> _mergeSourceMaps(
      Map<String, dynamic> prev, Map<String, dynamic> incoming) {
    final merged = <String, dynamic>{...prev, ...incoming};

    // Union "sources"
    final set = <String>{};
    final prevSources = prev['sources'];
    if (prevSources is Iterable) {
      for (final s in prevSources) set.add(s.toString());
    }
    final inType = incoming['type'];
    if (inType is String && inType.isNotEmpty) set.add(inType);
    merged['sources'] = set.toList();

    // Preserve a compact preview if available
    if ((incoming['rawPreview'] ?? '').toString().isNotEmpty) {
      merged['rawPreview'] = incoming['rawPreview'];
    }

    // Always touch mergedAt (server time)
    merged['mergedAt'] = FieldValue.serverTimestamp();

    return merged;
  }

  static DateTime? _safeDate(dynamic v) {
    if (v is DateTime) return v;
    if (v is Timestamp) return v.toDate();
    return null;
  }
}
