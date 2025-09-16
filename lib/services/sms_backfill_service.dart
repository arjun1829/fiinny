// lib/services/sms_backfill_service.dart
//
// Historical SMS import that is privacy-safe & rules-compliant.
// - Cursor: users/{user}/ingest_index/sms  (fields: lastTsMs, updatedAt)
// - Dedupe: users/{user}/ingest_keys/keys/sms_{hash} (no bodies stored)
// - Calls ParsingPipeline only for unseen, likely-transactional messages.
// - Android-only (guards with Platform.isAndroid)
//
// Usage:
//   final svc = SmsBackfillService(userDocId: userPhone, pipeline: parsingPipeline);
//   await svc.run(
//     since: DateTime.now().subtract(const Duration(days: 180)),
//     onProgress: (n) => setState(() => _imported = n),
//   );
//
// You can call svc.cancel() to stop a long-running backfill.

import 'dart:convert';
import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/foundation.dart';
import 'package:telephony/telephony.dart';

import '../parsing_core/ingest/sms_backfill_pager.dart';
import '../parsing_core/ingest/sms_ingestor.dart' as core;
import '../parsing_core/pipeline.dart';
import 'sms/sms_permission_helper.dart';

class SmsBackfillService {
  SmsBackfillService({
    required this.userDocId,
    required this.pipeline,
    FirebaseFirestore? firestore,
  }) : _db = firestore ?? FirebaseFirestore.instance;

  final String userDocId;           // ← your phone-number doc id
  final ParsingPipeline pipeline;
  final FirebaseFirestore _db;

  final Telephony _telephony = Telephony.instance;
  final core.SmsIngestor _ingestor = core.SmsIngestor();

  bool _cancelled = false;

  // ---------- Firestore paths (RULES-COMPLIANT) ----------
  /// Cursor doc for SMS scanning (no bodies) → users/{user}/ingest_index/sms
  DocumentReference<Map<String, dynamic>> get _cursorDoc =>
      _db.collection('users').doc(userDocId).collection('ingest_index').doc('sms');

  /// Dedupe key location → users/{user}/ingest_keys/keys/sms_{hash}
  DocumentReference<Map<String, dynamic>> _processedDoc(String hash) =>
      _db
          .collection('users').doc(userDocId)
          .collection('ingest_keys').doc('keys')
          .collection('keys').doc('sms_$hash');

  // ---------- Light heuristics (same as realtime) ----------
  static final RegExp _otpWord =
  RegExp(r'\b(?:otp|one[-\s]?time\s?password|verification\s?code)\b', caseSensitive: false);
  static final RegExp _otpDigits = RegExp(r'(?<!\d)\d{4,8}(?!\d)');

  static const List<String> _allowSenderPrefixes = [
    'AX-', 'BX-', 'QP-', 'AD-', 'VK-', 'BP-', 'DM-', 'JD-', 'DZ-',
  ];
  static const List<String> _allowKeywords = [
    'HDFC', 'ICICI', 'SBI', 'KOTAK', 'YESBANK', 'AXIS', 'IDFC', 'RBL', 'PNB', 'FEDERAL',
    'PAYTM', 'PHONEPE', 'GOOGLE', 'G-PAY', 'GPAY', 'AMAZONPAY', 'AMAZON',
    'UPI', 'VPA', 'IMPS', 'NEFT', 'RTGS',
    'DEBITED', 'CREDITED', 'PAYMENT', 'WITHDRAWN', 'PURCHASE', 'SPENT',
    'EMI', 'CARD', 'LOAN', 'STATEMENT', 'BILL', 'INVOICE'
  ];
  static const List<String> _denyKeywords = [
    'NEWSLETTER', 'PROMO', 'SALE', 'DISCOUNT', 'OFFER', 'REGISTER', 'SURVEY',
    'YOUTUBE', 'FACEBOOK', 'INSTAGRAM', 'TWITTER', 'SPOTIFY', 'NETFLIX'
  ];

  bool _isLikelyTxn(String address, String body) {
    final a = (address).toUpperCase();
    final b = (body).toUpperCase();
    if (_denyKeywords.any(b.contains)) return false;
    final hasPref = _allowSenderPrefixes.any((p) => a.contains(p));
    final hasKey  = _allowKeywords.any((k) => a.contains(k) || b.contains(k));
    final looksOtpOnly = _otpWord.hasMatch(b) && _otpDigits.hasMatch(b) && b.length < 120;
    final tooShort = body.trim().length < 12;
    return (hasPref || hasKey) && !looksOtpOnly && !tooShort;
  }

  // We hash body but never store it; Firestore only sees the hash string.
  String _hashKey(String address, int dateMs, String body) {
    final raw = '$address|$dateMs|${body.trim()}';
    return crypto.sha256.convert(utf8.encode(raw)).toString();
  }

  Future<bool> _seen(String hash) async {
    try {
      final d = await _processedDoc(hash).get();
      return d.exists;
    } catch (_) {
      return false;
    }
  }

  Future<void> _markSeen({
    required String hash,
    required DateTime when,
    required String address,
  }) async {
    try {
      await _processedDoc(hash).set({
        'source': 'sms',
        'hash': hash,
        'address': address,
        'when': Timestamp.fromDate(when.toUtc()),
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: false));
    } catch (e) {
      debugPrint('[SMS-BF] markSeen failed: $e');
    }
  }

  Future<DateTime?> _loadLastCursor() async {
    try {
      final d = await _cursorDoc.get();
      final n = d.data()?['lastTsMs'];
      if (n is int && n > 0) return DateTime.fromMillisecondsSinceEpoch(n);
      final ts = d.data()?['lastScanAt']; // legacy fallback
      if (ts is Timestamp) return ts.toDate();
    } catch (_) {}
    return null;
  }

  Future<void> _saveCursor(DateTime dt) async {
    try {
      await _cursorDoc.set({
        'lastTsMs': dt.millisecondsSinceEpoch,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (_) {}
  }

  /// Cancel an in-flight backfill.
  void cancel() {
    _cancelled = true;
  }

  /// Run a backfill over a date range in windows (default 7 days) and pages (default 200).
  ///
  /// [since] inclusive start time. [until] defaults to now.
  /// [onProgress] optional callback with processed message count.
  Future<void> run({
    required DateTime since,
    DateTime? until,
    int windowDays = 7,
    int pageSize = 200,
    void Function(int processed)? onProgress,
  }) async {
    _cancelled = false;

    // Android-only guard
    if (!Platform.isAndroid) {
      debugPrint('[SMS-BF] Skipped (non-Android device)');
      return;
    }

    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) {
      debugPrint('[SMS-BF] Skipped (SMS permission not granted)');
      return;
    }

    final pager = SmsBackfillPager(_fetcher);

    int processed = 0;
    final end = until ?? DateTime.now();

    // Try to start from max(since, lastCursor) to avoid re-scanning old windows.
    final last = await _loadLastCursor();
    final effectiveSince = (last != null && last.isAfter(since)) ? last : since;

    await pager.walk(
      since: effectiveSince,
      until: end,
      windowDays: windowDays,
      pageSize: pageSize,
      onMessage: (address, body, receivedAt) async {
        if (_cancelled) return;

        // Heuristic filter
        if (!_isLikelyTxn(address, body)) return;

        final ms = receivedAt.millisecondsSinceEpoch;
        final hash = _hashKey(address, ms, body);
        if (await _seen(hash)) return;

        final cm = _ingestor.toCanonical(
          address: address,
          body: body,
          receivedAt: receivedAt,
          rawMeta: const {}, // threadId not available in backfill pager
        );

        await pipeline.handle(cm);
        await _markSeen(hash: hash, when: receivedAt, address: address);

        processed++;
        if (onProgress != null) onProgress(processed);

        // Occasionally advance the cursor during long jobs
        if (processed % 200 == 0) {
          await _saveCursor(receivedAt);
        }
      },
    );

    // Final cursor set to the end of range (or "now")
    await _saveCursor(end);
  }

  /// Fetcher used by the pager:
  /// - Pulls inbox SMS (address, body, date) via Telephony
  /// - Filters to [from, to) range
  /// - Applies client-side paging using [limit] & [offset]
  Future<List<Map<String, dynamic>>> _fetcher(
      DateTime from,
      DateTime to,
      int limit,
      int offset,
      ) async {
    final msgs = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    final rows = <Map<String, dynamic>>[];
    for (final m in msgs) {
      final ms = m.date;
      if (ms == null) continue;
      final ts = DateTime.fromMillisecondsSinceEpoch(ms);

      // keep messages within [from, to)
      if (ts.isBefore(from) || !ts.isBefore(to)) continue;

      rows.add({
        'address': m.address ?? 'UNKNOWN',
        'body': m.body ?? '',
        'receivedAt': ts,
      });
    }

    // Apply paging (avoid num.clamp → keep ints)
    final start = offset < rows.length ? offset : rows.length;
    final end = (start + limit) < rows.length ? (start + limit) : rows.length;
    return rows.sublist(start, end);
  }
}
