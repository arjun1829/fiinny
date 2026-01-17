// lib/services/gmail_service.dart
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';

import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:googleapis/gmail/v1.dart' as gmail;
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/expense_item.dart';
import '../config/app_config.dart';
import './ai/tx_extractor.dart';
import 'ingest/enrichment_service.dart';
import '../brain/loan_detection_service.dart';
import '../logic/loan_detection_parser.dart';

import './ingest_index_service.dart';
import './tx_key.dart';
import 'notification_service.dart';
import './ingest_state_service.dart';
import './credit_card_service.dart'; // import added
import './ingest_job_queue.dart';
// merge
// alias normalize
import './ingest_filters.dart' as filt; // ✅ stronger filtering helpers
import 'parsers/gmail_parser_logic.dart';
import 'parsers/gmail_dtos.dart';

// Merge policy: OFF (for testing), ENRICH (recommended), SILENT (current behavior)
enum ReconcilePolicy { off, mergeEnrich, mergeSilent }

// ── Bank detection & tiering (major vs other) ────────────────────────────────

class GmailService {
  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool autoPostTxns = true; // create expenses/incomes immediately
  static const bool useServiceWrites = false; // write via Firestore set(merge)
  static const int defaultOverlapHours = 24;
  static const int initialHistoryDays = 120;
  static const bool autoRecatLast24h = true;
  static const ReconcilePolicy reconcilePolicy = ReconcilePolicy.mergeEnrich;
  // Backfill behaviour:
  // - On first Gmail run, or if user comes back after a long gap,
  //   we aggressively backfill up to this many days.
  static const int maxBackfillDays = 1000;

  // "Long gap" threshold: if last Gmail sync was more than this many
  // days ago, treat it like a fresh/backfill sync.
  static const int longGapDays = 60;

  String _maskSensitive(String s) {
    var t = s;
    // 1. Mask long digit runs (cards/accounts 8-20 length), keep last4
    // Modified to be careful not to kill valid amounts, though amounts usually have formatting or context.
    // This targets pure digit strings like account numbers.
    t = t.replaceAllMapped(
      RegExp(r'\b(?<![₹\.])(\d{4})\d{4,12}(\d{4})\b'),
      (m) => '****${m.group(2)}',
    );

    // 2. Strict OTP/password redaction
    t = t.replaceAll(
        RegExp(r'\b(OTP|ONE[-\s]?TIME\s*PASSWORD)\b.*', caseSensitive: false),
        '[REDACTED OTP]');

    // 3. Email redaction (CASA Requirement: Don't leak other people's emails)
    // Matches standard email pattern
    t = t.replaceAll(
      RegExp(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b'),
      '[EMAIL]',
    );

    // 4. Phone number redaction (India specific + international)
    // Matches +91-xxxxx or 10-digit mobile numbers allowing for space/dash separators
    // We avoid masking simplified amounts by looking for the specific structure of phones.
    t = t.replaceAll(
      RegExp(r'(?<!\d)(?:(?:\+91)|(?:91)|0)?\s?[6-9]\d{4}\s?\d{5}(?!\d)'),
      '[PHONE]',
    );

    return t;
  }

  // Major public + private sector banks we want strong primary logic for.

  // Testing backfill like SMS

  // Debug logs
  void _log(String s) {
    if (kDebugMode) print('[GmailService] $s');
  }

  static final _scopes = [gmail.GmailApi.gmailReadonlyScope];
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: _scopes,
    clientId: kIsWeb
        ? '1085936196639-ffl2rshle55b6ukgq22u5agku68mqpr1.apps.googleusercontent.com'
        : null,
  );
  GoogleSignInAccount? _currentUser;

  final IngestIndexService _index = IngestIndexService();
  final CreditCardService _creditCardService = CreditCardService();

  String _billDocId({
    required String? bank,
    required String? last4,
    required DateTime msgDate,
  }) {
    final y = msgDate.year;
    final m = msgDate.month.toString().padLeft(2, '0');
    return 'ccbill_${(bank ?? "CARD")}_${(last4 ?? "XXXX")}_$y-$m';
  }

  String _initialBillStatus(DateTime? due) {
    if (due == null) return 'open';
    final now = DateTime.now();
    if (due.isBefore(now)) return 'overdue';
    final days = due.difference(now).inDays;
    if (days <= 3) return 'due_soon';
    return 'upcoming';
  }

  // Deterministic id from txKey (djb2) — keeps SMS/Gmail parity
  String _docIdFromKey(String key) {
    int hash = 5381;
    for (final code in key.codeUnits) {
      hash = ((hash << 5) + hash) + code;
    }
    final hex = (hash & 0x7fffffff).toRadixString(16);
    return 'ing_$hex';
  }

  // --- helpers added ----------------------------------------------------------

  // ---------------------------------------------------------------------------

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    _currentUser = null;
  }

  // ── Legacy compat: keep old entry point alive ──────────────────────────────
  Future<void> fetchAndStoreTransactionsFromGmail(
    String userId, {
    int newerThanDays = initialHistoryDays,
    int maxResults = 300,
    bool isAutoBg = false, // Flag to indicate background auto-sync
  }) async {
    final st = await IngestStateService.instance.get(userId);
    final now = DateTime.now();
    DateTime since;

    // SMART SYNC WINDOW:
    // If we have a last sync time, resume from there (minus buffer).
    // If user hasn't synced in 4 days, we fetch 4 days.
    // Safety buffer: 24h to catch late-arriving emails for the previous day.

    try {
      final last = (st as dynamic)?.lastGmailTs;
      if (last != null) {
        final DateTime lastDt =
            (last is Timestamp) ? last.toDate() : (last as DateTime);
        // "Resume" from last sync minus 24h buffer
        since = lastDt.subtract(const Duration(hours: 24));

        // Safety cap: even if resuming, don't go back further than MAX_BACKFILL (e.g. 1000 days could be too huge)
        // But mainly we want to ensure we don't accidentally fetch *too* little if they missed 3 days.
        // The above `subtract(24h)` handles the 3-day gap automatically (since = 3 days ago).

        // However, if the gap is HUGE (e.g. > 60 days), we might treat it as a fresh backfill or cap it.
        // For now, let's respect the user request: "pull from where it was left last time".
        // functionality logic is satisfied.

        _log(
            'Smart Sync: Resuming from ${since.toIso8601String()} (Last: $lastDt)');
      } else {
        // No last sync? Use default lookback (e.g. 120 days for fresh)
        since = now.subtract(Duration(days: newerThanDays));
        _log('Smart Sync: No history, using default lookback: $since');
      }
    } catch (_) {
      since = now.subtract(Duration(days: newerThanDays));
    }
    await _fetchAndStage(userId: userId, since: since, pageSize: maxResults);
  }

  // ── New entry points ───────────────────────────────────────────────────────

  Future<void> initialBackfill({
    required String userId,
    int newerThanDays = initialHistoryDays,
    int pageSize = 500,
  }) async {
    // Ensure ingest state exists and load it (gives us lastGmailAt if any)
    final st = await IngestStateService.instance.getOrCreate(userId);
    final now = DateTime.now();

    int daysBack;

    if (st.lastGmailAt == null) {
      // First time we are pulling Gmail for this user → heavy backfill
      daysBack = maxBackfillDays;
    } else {
      final gapDays = now.difference(st.lastGmailAt!).inDays;
      // If user has been away for a long time, treat like a "fresh" backfill
      daysBack = gapDays > longGapDays ? maxBackfillDays : newerThanDays;
    }

    // In TEST_MODE we still cap by TEST_BACKFILL_DAYS as before
    final since = now.subtract(
      Duration(days: daysBack.clamp(1, maxBackfillDays)),
    );

    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);

    if (autoRecatLast24h) {
      await recategorizeLastWindow(userId: userId, windowHours: 24, batch: 50);
    }
  }

  Future<void> syncDelta({
    required String userId,
    int overlapHours = defaultOverlapHours,
    int pageSize = 300,
    int fallbackDaysIfNoWatermark = initialHistoryDays,
  }) async {
    final st = await IngestStateService.instance.get(userId);
    final now = DateTime.now();

    DateTime since;
    final last = st.lastGmailAt;

    if (last == null) {
      // No watermark yet → treat like a backfill, but capped.
      final daysBack = fallbackDaysIfNoWatermark.clamp(1, maxBackfillDays);
      since = now.subtract(Duration(days: daysBack));
    } else {
      final gapDays = now.difference(last).inDays;
      if (gapDays > longGapDays) {
        // User came back after a long time (e.g. > 2 months) → widen window aggressively.
        since = now.subtract(Duration(days: maxBackfillDays));
      } else {
        // Normal delta sync with overlap
        since = last.subtract(Duration(hours: overlapHours));
      }
    }

    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);

    if (autoRecatLast24h) {
      await recategorizeLastWindow(userId: userId, windowHours: 24, batch: 50);
    }
  }

  // ── Main fetch + stage ─────────────────────────────────────────────────────
  Future<void> _fetchAndStage({
    required String userId,
    required DateTime since,
    int pageSize = 300,
  }) async {
    try {
      _currentUser = await _googleSignIn.signInSilently();
      if (_currentUser == null) {
        _log('signInSilently returned null, attempting interactive signIn...');
        _currentUser = await _googleSignIn.signIn();
      }
    } catch (e) {
      _log('Google Sign-In error: $e');
      final errStr = e.toString();
      if (errStr.contains('People API has not been used') ||
          errStr.contains('PEOPLE_API_NOT_ENABLED')) {
        throw Exception(
            'Please enable the "People API" in your Google Cloud Console. This is required for Web Sign-In.\n\nCheck the console link in the error details.');
      }
      rethrow;
    }
    _log('Sign-in result: ${_currentUser?.email}');
    if (_currentUser == null) throw Exception('Google Sign-In failed');

    final headers = await _currentUser!.authHeaders;
    final gmailApi = gmail.GmailApi(_GoogleAuthClient(headers));

    final newerDays = _daysBetween(DateTime.now(), since).clamp(0, 36500);
    final baseQ =
        '(bank OR card OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR payment OR UPI OR refund OR salary OR invoice OR receipt OR statement OR bill) '
        'newer_than:${newerDays}d -in:spam -in:trash -category:promotions '
        '-subject:(Digest OR Newsletter) -from:daily.digest.groww.in';

    String? pageToken;
    DateTime? newestTouched;

    while (true) {
      final list = await _withRetries(() => gmailApi.users.messages.list(
            'me',
            maxResults: pageSize.clamp(1, 500),
            q: baseQ,
            pageToken: pageToken,
            labelIds: ['INBOX'],
          ));

      final msgs = list.messages ?? [];
      if (msgs.isEmpty) break;

      for (var i = 0; i < msgs.length; i += 10) {
        final slice = msgs.sublist(i, (i + 10).clamp(0, msgs.length));
        final rawMessages = <RawGmailMessage>[];

        await Future.wait(slice.map((m) async {
          try {
            final msg = await _withRetries(
              () => gmailApi.users.messages.get('me', m.id!),
            );

            final tsMs = int.tryParse(msg.internalDate ?? '0') ?? 0;
            final dt = DateTime.fromMillisecondsSinceEpoch(
              tsMs > 0 ? tsMs : DateTime.now().millisecondsSinceEpoch,
            );
            if (dt.isBefore(since)) return;

            final headersDto = (msg.payload?.headers ?? [])
                .map((h) => MessageHeaderDto(h.name ?? '', h.value ?? ''))
                .toList();

            rawMessages.add(RawGmailMessage(
              id: msg.id ?? '',
              threadId: msg.threadId ?? '',
              internalDate: msg.internalDate ?? '0',
              headers: headersDto,
              plainTextBody:
                  _extractPlainText(msg.payload) ?? (msg.snippet ?? ''),
            ));
          } catch (e) {
            _log('message error: $e');
          }
        }));

        if (rawMessages.isEmpty) continue;

        // ISOLATE PARSING
        final parsedResults = await compute(parseBatchInIsolate, rawMessages);

        for (final parsed in parsedResults) {
          if (parsed == null) continue;
          final touched = await _handleParsedTxn(userId, parsed);
          if (touched != null &&
              (newestTouched == null || touched.isAfter(newestTouched))) {
            newestTouched = touched;
          }
        }
      }

      pageToken = list.nextPageToken;
      if (pageToken == null) break;
    }

    if (newestTouched != null) {
      await IngestStateService.instance
          .setProgress(userId, lastGmailTs: newestTouched);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  Future<T> _withRetries<T>(Future<T> Function() fn) async {
    int attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (e) {
        attempt++;
        if (attempt >= 3) rethrow;
        final jitter = math.Random().nextInt(250);
        final backoffMs = ((math.pow(2, attempt)).toInt() * 300) + jitter;
        await Future.delayed(Duration(milliseconds: backoffMs));
      }
    }
  }

  int _daysBetween(DateTime a, DateTime b) {
    final diff = a.toUtc().difference(b.toUtc()).inDays;
    return diff.abs();
  }

  String? _extractPlainText(gmail.MessagePart? part) {
    if (part == null) return null;

    String? decodeData(String? data) {
      if (data == null) return null;
      final norm = data.replaceAll('-', '+').replaceAll('_', '/');
      try {
        return utf8.decode(base64.decode(norm), allowMalformed: true);
      } catch (_) {
        try {
          return utf8.decode(base64Url.decode(data), allowMalformed: true);
        } catch (_) {
          return null;
        }
      }
    }

    if (part.parts == null || part.parts!.isEmpty) {
      final mime = part.mimeType ?? '';
      final data = decodeData(part.body?.data);
      if (data == null) return null;
      if (mime.startsWith('text/plain')) return data;
      if (mime.startsWith('text/html')) return _stripHtml(data);
      return data;
    }

    String? findPlain(gmail.MessagePart p) {
      if ((p.mimeType ?? '').startsWith('text/plain')) {
        final d = decodeData(p.body?.data);
        if (d != null) return d;
      }
      if (p.parts != null) {
        for (final c in p.parts!) {
          final got = findPlain(c);
          if (got != null) return got;
        }
      }
      return null;
    }

    final plain = findPlain(part);
    if (plain != null) return plain;

    String? findHtml(gmail.MessagePart p) {
      if ((p.mimeType ?? '').startsWith('text/html')) {
        final d = decodeData(p.body?.data);
        if (d != null) return _stripHtml(d);
      }
      if (p.parts != null) {
        for (final c in p.parts!) {
          final got = findHtml(c);
          if (got != null) return got;
        }
      }
      return null;
    }

    final html = findHtml(part);
    if (html != null) return html;

    for (final p in part.parts!) {
      final t = _extractPlainText(p);
      if (t != null) return t;
    }
    return null;
  }

  String _stripHtml(String html) {
    final text = html
        .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
        .replaceAll(RegExp(r'</p\s*>', caseSensitive: false), '\n')
        .replaceAll(
            RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), ' ')
        .replaceAll(
            RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'<[^>]+>'), ' ');
    return text.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  // Merchant extraction with "Merchant Name:" / "for ..." / known brands

  Future<void> recategorizeLastWindow({
    required String userId,
    int windowHours = 24,
    int batch = 50,
  }) async {
    if (!autoRecatLast24h || !AiConfig.llmOn || batch <= 0) return;

    final cutoff = Timestamp.fromDate(
      DateTime.now().subtract(Duration(hours: windowHours)),
    );
    final userRef = FirebaseFirestore.instance.collection('users').doc(userId);
    final collections = ['expenses', 'incomes'];

    for (final col in collections) {
      QuerySnapshot<Map<String, dynamic>> snap;
      try {
        snap = await userRef
            .collection(col)
            .where('date', isGreaterThanOrEqualTo: cutoff)
            .orderBy('date', descending: true)
            .limit(batch)
            .get();
      } catch (e) {
        _log('recategorize($col) query error: $e');
        continue;
      }

      if (snap.docs.isEmpty) continue;

      final candidates = <_RecatCandidate>[];
      for (final doc in snap.docs) {
        final data = doc.data();
        final source = (data['categorySource'] as String? ?? '').toLowerCase();
        if (source == 'user_override') continue;
        if (data['categoryEditedAt'] != null) continue;

        final category = (data['category'] as String? ?? '').trim();
        final conf = (data['categoryConfidence'] as num?)?.toDouble();
        final needs = category.isEmpty ||
            category.toLowerCase() == 'other' ||
            category.toLowerCase() == 'general' ||
            (conf != null && conf < 0.55);
        if (!needs) continue;

        final amountNum = data['amount'] as num?;
        if (amountNum == null) continue;
        final amount = amountNum.toDouble();
        if (amount <= 0) continue;

        final rawDate = data['date'];
        DateTime? when;
        if (rawDate is Timestamp) {
          when = rawDate.toDate();
        } else if (rawDate is DateTime) {
          when = rawDate;
        }
        if (when == null) continue;

        final merchantField = (data['merchant'] as String? ??
                data['counterparty'] as String? ??
                '')
            .trim();
        String preview = '';
        final sr = data['sourceRecord'];
        if (sr is Map<String, dynamic>) {
          final rawPreview = sr['rawPreview'];
          final raw = sr['raw'];
          if (rawPreview is String && rawPreview.isNotEmpty) {
            preview = rawPreview;
          } else if (raw is String && raw.isNotEmpty) {
            preview = raw;
          }
        }
        if (preview.isEmpty) {
          preview = (data['note'] as String? ?? '').trim();
        }
        if (preview.isEmpty) continue;

        final instrumentHint = (data['instrument'] as String? ?? '').trim();
        final dir = col == 'expenses' ? 'debit' : 'credit';
        final hintParts = <String>[
          'HINTS: backfill=true',
          'dir=$dir',
          if (instrumentHint.isNotEmpty)
            'instrument=${instrumentHint.toLowerCase().replaceAll(' ', '_')}',
          if (merchantField.isNotEmpty)
            'merchant_norm=${merchantField.toLowerCase().replaceAll(' ', '_')}',
        ];
        final enrichedDesc = '${hintParts.join('; ')}; $preview';

        candidates.add(_RecatCandidate(
          docRef: doc.reference,
          raw: TxRaw(
            amount: amount,
            currency: 'INR',
            regionCode: 'IN',
            merchant: merchantField.isNotEmpty ? merchantField : 'MERCHANT',
            desc: enrichedDesc,
            date: when.toIso8601String(),
          ),
        ));
      }

      if (candidates.isEmpty) continue;

      final raws = candidates.map((c) => c.raw).toList();
      final labels = await TxExtractor.labelUnknown(raws);
      if (labels.isEmpty) continue;

      final updates = <Future<void>>[];
      for (var i = 0; i < labels.length && i < candidates.length; i++) {
        final res = labels[i];
        final goodCategory = res.category.isNotEmpty &&
            res.category.toLowerCase() != 'other' &&
            res.confidence >= AiConfig.confThresh;
        if (!goodCategory) continue;

        final payload = {
          'category': res.category,
          'subcategory': res.subcategory,
          'categoryConfidence': res.confidence,
          'categorySource': 'llm',
          if (res.labels.isNotEmpty)
            'labels': FieldValue.arrayUnion(res.labels),
        };

        updates.add(candidates[i].docRef.set(payload, SetOptions(merge: true)));
      }

      if (updates.isNotEmpty) {
        await Future.wait(updates);
      }
    }
  }

  Future<void> _resolveAlertsForAmount(String userId, double amount) async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('alerts')
          .where('isRead', isEqualTo: false)
          .where('severity', isEqualTo: 'critical')
          .get();

      for (final doc in snap.docs) {
        final alertAmt = (doc.data()['amount'] as num?)?.toDouble() ?? 0.0;
        if ((alertAmt - amount).abs() < 10) {
          // fuzzy match ₹10
          await doc.reference.update({
            'isRead': true,
            'resolution': 'auto_resolved_by_payment',
            'resolvedAt': FieldValue.serverTimestamp()
          });
          _log('Auto-resolved alert ${doc.id} with payment of $amount');

          final msgs = [
            "Crisis averted! 😮💨 Payment detected, alert cleared.",
            "Phew! We saw that ₹${amount.toInt()}. You're all good now! ✨",
            "Payment spotted! 🚀 That red alert is gone.",
            "Smooth move. 😎 Payment confirmed, alert dismissed.",
            "All clear! 🌈 We matched your payment to the alert.",
          ];
          final msg = msgs[DateTime.now().millisecond % msgs.length];

          await NotificationService().showNotification(
            title: 'EMI Paid! Alert Resolved',
            body: msg,
            payload: '/loans',
          );
        }
      }
    } catch (e) {
      _log('Error auto-resolving alerts: $e');
    }
  }

  Future<String?> _checkForCriticalAlerts(
      String userId, String rawText, DateTime date, double amount) async {
    // FRESHNESS CHECK: Skip alerts older than the start of last month (avoids spam during backfill)
    final now = DateTime.now();
    final startOfLastMonth = DateTime(now.year, now.month - 1, 1);
    if (date.isBefore(startOfLastMonth)) {
      return null;
    }

    final lower = rawText.toLowerCase();

    // Patterns
    final isSiFail = lower.contains('si attempt') && lower.contains('failed');
    final isEmiFail = lower.contains('emi') && lower.contains('failed');
    final isInsufficient = lower.contains('insufficient change') ||
        lower.contains('insufficient bal') ||
        lower.contains('insufficient fund');

    if (isSiFail || isEmiFail || isInsufficient) {
      // It's a failure!
      String title = '⚠️ Transaction Failed';
      String body = 'A transaction could not be completed.';

      if (isSiFail) {
        title = '⚠️ Auto-Pay Failed';
        body = 'Your Standing Instruction (SI) attempt has failed.';
        if (amount > 0) body += ' Amount: ₹$amount';
      } else if (isEmiFail) {
        title = '⚠️ EMI Payment Failed';
        body = 'Your EMI payment could not be processed.';
        if (amount > 0) body += ' Amount: ₹$amount';
      }

      if (isInsufficient) {
        body += ' Reason: Insufficient Balance.';
      }

      final key = 'ALERT|${date.millisecondsSinceEpoch}|${amount.toInt()}';
      final ref = FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('alerts')
          .doc(key);

      // Idempotent write
      await ref.set({
        'title': title,
        'body': body,
        'date': Timestamp.fromDate(date),
        'severity': 'critical', // critical | warning | info
        'isRead': false,
        'amount': amount,
        'raw': _maskSensitive(rawText),
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // TRIGGER LOAN SUGGESTION ON FAILURE TOO
      if (isSiFail || isEmiFail) {
        await LoanDetectionService().checkLoanTransaction(userId, {
          'amount': amount,
          'merchant': 'Loan Repayment Alert',
          'category': 'Payments',
          'subcategory': 'Loan Repayment',
          'note': 'Detected via Failed Alert: $rawText',
          'description': 'Loan Repayment',
          'date': Timestamp.fromDate(date),
        });
      }

      // Notify User
      await NotificationService().showNotification(
        title: title,
        body: body,
        payload: '/loans',
      );

      return key;
    }

    return null;
  }

  Future<DateTime?> _handleParsedTxn(
      String userId, ParsedGmailTxn parsed) async {
    final msgDate = parsed.msgDate;
    final combined = parsed.combinedBody;
    final bank = parsed.bankName;
    final cardLast4 = parsed.cardLast4;
    final amount = parsed.amount;
    final direction = parsed.direction;

    final upiVpa = parsed.upiVpa;

    // --- SMART LOAN DETECTION START ---
    try {
      final loanRes = LoanDetectionParser.parse(combined);
      if (loanRes != null) {
        final lender = loanRes.counterPartyName ??
            (loanRes.type == LoanType.given ? 'Borrower' : 'Lender');
        final key = 'EMAIL|${lender.toUpperCase()}|${loanRes.amount.toInt()}';

        final suggestion = LoanSuggestion(
          key: key,
          lender: lender,
          emi: loanRes.amount,
          firstSeen: msgDate,
          lastSeen: msgDate,
          occurrences: 1,
          autopay: false,
          paymentDay: msgDate.day,
          confidence: loanRes.confidence,
        );

        final ref = FirebaseFirestore.instance
            .collection('users')
            .doc(userId)
            .collection('loan_suggestions')
            .doc(key);

        final existing = await ref.get();
        if (!existing.exists ||
            (existing.data()?['status'] ?? 'new') == 'new') {
          await ref.set(suggestion.toJson(), SetOptions(merge: true));
          if (existing.exists) {
            await ref.update({
              'lastSeen': Timestamp.fromDate(msgDate),
              'occurrences': FieldValue.increment(1),
            });
          }
        }
      }
    } catch (e) {
      _log('Loan parser error: $e');
    }
    // --- SMART LOAN DETECTION END ---

    // Card Bill Logic
    if (parsed.billInfo != null) {
      final bMap = parsed.billInfo!;
      final total = (bMap['totalDue'] as num?)?.toDouble() ??
          (bMap['minDue'] as num?)?.toDouble() ??
          amount ??
          0.0;
      if (total <= 0) return null;

      final dueDate =
          bMap['dueDate'] != null ? DateTime.tryParse(bMap['dueDate']) : null;
      final cycleDate = (bMap['statementEnd'] != null
              ? DateTime.tryParse(bMap['statementEnd'])
              : null) ??
          (dueDate ?? msgDate);
      // statementEnd not in parser map currently? handled gracefully

      final billId =
          _billDocId(bank: bank, last4: cardLast4, msgDate: cycleDate);
      final billRef = FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('bill_reminders')
          .doc(billId);

      await billRef.set({
        'kind': 'credit_card_bill',
        'issuerBank': bank,
        'cardLast4': cardLast4,
        'dueDate': dueDate != null ? Timestamp.fromDate(dueDate) : null,
        'totalDue': bMap['totalDue'],
        'minDue': bMap['minDue'],
        'status': _initialBillStatus(dueDate),
        'amountPaid': FieldValue.increment(0),
        'updatedAt': Timestamp.now(),
      }, SetOptions(merge: true));

      // record raw provenance
      await billRef.set({
        'sourceRecord': {
          'gmail': {
            'gmailId': parsed.msgId,
            'threadId': parsed.threadId,
            'internalDateMs': int.tryParse(parsed.internalDate),
            'emailDomain': parsed.emailDomain,
            'rawPreview': GmailPureParser.preview(combined),
            'when': Timestamp.fromDate(DateTime.now()),
          }
        },
        'merchantKey': (bank ?? 'CREDIT CARD').toUpperCase(),
      }, SetOptions(merge: true));

      return msgDate;
    }

    // Alert Check
    if (amount != null && amount > 0) {
      final alertId =
          await _checkForCriticalAlerts(userId, combined, msgDate, amount);
      if (alertId != null) {
        _log('Skipped transaction creation due to CRITICAL ALERT: $alertId');
        return msgDate;
      }
    }

    if (amount == null || amount <= 0 || direction == null) return null;

    // Metadata Update
    // Metadata Update
    final ccMeta = parsed.creditCardMetadata ?? {};
    if (ccMeta.isNotEmpty && (bank != null || cardLast4 != null)) {
      await _creditCardService.updateCardMetadataByMatch(
        userId,
        bankName: bank,
        last4: cardLast4,
        availableLimit: ccMeta['availableLimit'],
        totalLimit: ccMeta['totalLimit'],
        rewardPoints: ccMeta['rewardPoints'],
      );
    }

    // Enrichment
    final preview =
        GmailPureParser.preview(GmailPureParser.maskSensitive(combined));
    final hintParts = <String>[
      'HINTS: dir=$direction',
      if (parsed.isEmiAutopay) 'cues=emi,autopay',
      if (parsed.instrument != null)
        'instrument=${parsed.instrument!.toLowerCase().replaceAll(' ', '_')}',
      if (upiVpa != null) 'upi=$upiVpa',
    ];

    final enriched = await EnrichmentService.instance.enrichTransaction(
      userId: userId,
      rawText: GmailPureParser.maskSensitive(combined),
      amount: amount,
      date: msgDate,
      hints: hintParts,
      merchantRegex: parsed.guessedMerchant,
    );

    var merchantNorm = enriched.merchantName;

    // ... logic from _handleMessage for merchant fallback ...
    if (merchantNorm.isEmpty) {
      if (parsed.guessedMerchant != null) {
        merchantNorm = parsed.guessedMerchant!;
      } else if (parsed.merchantName != null) {
        merchantNorm = parsed.merchantName!;
      }
    }

    final finalCategory = enriched.category;
    final finalSubcategory = enriched.subcategory;
    final emiLocked = parsed.isEmiAutopay;

    final key = buildTxKey(
      bank: bank,
      amount: amount,
      time: msgDate,
      type: direction,
      last4: cardLast4,
    );
    final claimed = await _index
        .claim(userId, key, source: 'gmail')
        .catchError((_) => false);
    if (claimed != true) return null;

    final sourceMeta = {
      'type': 'gmail',
      'gmailId': parsed.msgId,
      'threadId': parsed.threadId,
      'internalDateMs': int.tryParse(parsed.internalDate),
      'raw': GmailPureParser.maskSensitive(combined),
      'rawPreview': preview,
      'emailDomain': parsed.emailDomain,
      'when': Timestamp.fromDate(DateTime.now()),
      'txKey': key,
      'merchant': merchantNorm,
      'issuerBank': bank,
      'instrument': parsed.instrument,
    };

    // Writes (Expense or Income)
    if (direction == 'debit') {
      final expRef = FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('expenses')
          .doc(_docIdFromKey(key));
      final existingSnap = await expRef.get();
      final existingData = existingSnap.exists
          ? existingSnap.data() as Map<String, dynamic>
          : <String, dynamic>{};
      final isUserEdited =
          (existingData['updatedBy'] as String?)?.contains('user') ?? false;

      var note = GmailPureParser.cleanNoteSimple(combined);
      if (emiLocked) {
        final emiDigits = parsed.accountLast4 ?? cardLast4;
        note =
            'Paid towards your EMI${emiDigits != null ? ' ****$emiDigits' : ''}\n$note';
      }

      final e = ExpenseItem(
        id: expRef.id,
        type: 'Email Debit',
        amount: amount,
        note: note,
        date: msgDate,
        payerId: userId,
        cardLast4: cardLast4,
        cardType:
            GmailPureParser.isCard(parsed.instrument) ? 'Credit Card' : null,
        issuerBank: bank,
        instrument: parsed.instrument,
        instrumentNetwork: parsed.network,
        counterparty: merchantNorm,
        counterpartyType: 'MERCHANT',
        fx: parsed.amountFx != null
            ? {'amount': parsed.amountFx, 'currency': 'FX'}
            : null,
        fees: parsed.fees,
        tags: enriched.tags,
        createdAt: (existingData['createdAt'] as Timestamp?)?.toDate() ??
            DateTime.now(),
        createdBy: existingData['createdBy'] ?? 'parser:gmail',
        updatedAt: DateTime.now(),
        updatedBy: 'parser:gmail',
      );

      final jsonToWrite = e.toJson();
      if (isUserEdited) {
        jsonToWrite.remove('category');
        jsonToWrite.remove('subcategory');
        jsonToWrite.remove('counterparty');
        jsonToWrite.remove('note');
      }
      await expRef.set(jsonToWrite, SetOptions(merge: true));
      await expRef.set({
        'ingestSources': FieldValue.arrayUnion(['gmail'])
      }, SetOptions(merge: true));

      // Enrichment Data
      await expRef.set({
        'category': finalCategory,
        'subcategory': finalSubcategory,
        'categoryConfidence': enriched.confidence,
        'sourceRecord': sourceMeta,
      }, SetOptions(merge: true));

      // Loan check for single transaction
      if (finalCategory == 'Payments' &&
          (finalSubcategory.contains('Loans') ||
              finalSubcategory.contains('EMI'))) {
        await LoanDetectionService().checkLoanTransaction(userId, {
          'amount': amount,
          'merchant': merchantNorm,
          'category': finalCategory,
          'subcategory': finalSubcategory,
          'note': note,
          'date': Timestamp.fromDate(msgDate),
        });
      }

      // Queue Ingest
      try {
        await IngestJobQueue.enqueue(
          userId: userId,
          txKey: key,
          rawText: combined,
          amount: amount,
          currency: 'INR',
          timestamp: msgDate,
          source: 'email',
          direction: 'debit',
          docId: expRef.id,
          docCollection: 'expenses',
          docPath: 'users/$userId/expenses/${expRef.id}',
          enabled: true,
        );
        await _resolveAlertsForAmount(userId, amount);
      } catch (_) {}
    } else {
      // Income Write
      final incRef = FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('incomes')
          .doc(_docIdFromKey(key));
      await incRef.set({
        'amount': amount,
        'date': Timestamp.fromDate(msgDate),
        'type': 'Email Credit',
        'source': 'Email',
        'ingestSources': FieldValue.arrayUnion(['gmail']),
        'sourceRecord': sourceMeta,
      }, SetOptions(merge: true));

      await IngestJobQueue.enqueue(
        userId: userId,
        txKey: key,
        rawText: combined,
        amount: amount,
        currency: 'INR',
        timestamp: msgDate,
        source: 'email',
        direction: 'credit',
        docId: incRef.id,
        docCollection: 'incomes',
        docPath: 'users/$userId/incomes/${incRef.id}',
        enabled: true,
      );
    }

    _log('WRITE email type=$direction amt=$amount key=$key');
    return msgDate;
  }
}

class _GoogleAuthClient extends http.BaseClient {
  final Map<String, String> _headers;
  final http.Client _client = http.Client();
  _GoogleAuthClient(this._headers);
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    return _client.send(request..headers.addAll(_headers));
  }
}

class _RecatCandidate {
  _RecatCandidate({
    required this.docRef,
    required this.raw,
  });

  final DocumentReference<Map<String, dynamic>> docRef;
  final TxRaw raw;
}

// ── Small value class for card bill meta ──────────────────────────────────────

/// Top-level function for compute()
/// Top-level function for compute()
List<ParsedGmailTxn?> parseBatchInIsolate(List<RawGmailMessage> messages) {
  return messages.map((msg) {
    try {
      final combined =
          '${msg.plainTextBody}\n${_subjectFromHeaders(msg.headers)}'.trim();
      if (combined.isEmpty) return null;

      // 1. Detect Bank
      final bank =
          GmailPureParser.detectBank(headers: msg.headers, body: combined);

      // 2. Gate Checks
      final emailDomain = GmailPureParser.fromDomain(msg.headers);
      final looksTxn = GmailPureParser.passesTxnGate(combined,
          domain: emailDomain, bank: bank);

      final fromHdr = GmailPureParser.getHeader(msg.headers, 'from') ?? '';
      final listId = GmailPureParser.getHeader(msg.headers, 'list-id') ?? '';

      // Filter Checks
      if (filt.isLikelyNewsletter(listId, fromHdr) && !looksTxn) return null;
      if (filt.isLikelyPromo(combined) && !looksTxn) return null;
      if (filt.isLikelyBalanceAlert(combined) && !looksTxn) return null;

      final isCardBill = filt.isLikelyCardBillNotice(combined);
      if (!isCardBill && filt.isStatementOrBillNotice(combined) && !looksTxn) {
        return null;
      }

      if (!looksTxn && !isCardBill) return null;

      // 3. Extraction
      final direction = GmailPureParser.inferDirection(combined);
      final amountFx = GmailPureParser.extractFx(combined);
      final amountInr = amountFx == null
          ? (GmailPureParser.extractTxnAmount(combined, direction: direction) ??
              GmailPureParser.extractAnyInr(combined))
          : null;
      final amount = amountInr ?? (amountFx?['amount'] as double?);

      if ((amount == null || amount <= 0) && !isCardBill) {
        return null;
      }

      final postBal = GmailPureParser.extractPostTxnBalance(combined);
      final detectedBankCode =
          bank.code ?? GmailPureParser.guessIssuerBankFromBody(combined);

      var instrument = GmailPureParser.inferInstrument(combined);
      final hasCardContext = GmailPureParser.hasStrongCardCue(combined);
      var cardLast4 =
          hasCardContext ? GmailPureParser.extractCardLast4(combined) : null;
      final accountLast4 = GmailPureParser.extractAccountLast4(combined);
      final network = GmailPureParser.inferCardNetwork(combined);

      final isEmiAutopay = RegExp(
              r'\b(EMI|AUTOPAY|AUTO[- ]?DEBIT|NACH|E-?MANDATE|MANDATE)\b',
              caseSensitive: false)
          .hasMatch(combined);

      if (accountLast4 != null && (!hasCardContext || isEmiAutopay)) {
        instrument = 'Bank Account';
        cardLast4 = null;
      }

      final paidTo = GmailPureParser.extractPaidToName(combined);
      final guessedMerchant = GmailPureParser.guessMerchantSmart(combined);
      final ccMeta = GmailPureParser.extractCreditCardMetadata(combined);
      final upiVpa = GmailPureParser.extractUpiVpa(combined);
      final fees = GmailPureParser.extractFees(combined);
      final billInfo = GmailPureParser.extractCardBillInfo(combined);

      return ParsedGmailTxn(
        msgId: msg.id,
        threadId: msg.threadId,
        internalDate: msg.internalDate,
        msgDate: DateTime.fromMillisecondsSinceEpoch(
            int.tryParse(msg.internalDate) ?? 0),
        combinedBody: combined,
        emailDomain: emailDomain ?? '',
        direction: direction,
        amount: amount,
        amountFx: amountFx == null ? null : (amountFx['amount'] as double?),
        accountLast4: accountLast4,
        cardLast4: cardLast4,
        bankName: detectedBankCode,
        instrument: instrument,
        network: network,
        postBalance: postBal,
        merchantName: paidTo,
        guessedMerchant: guessedMerchant,
        creditCardMetadata: ccMeta,
        upiVpa: upiVpa,
        fees: fees,
        isEmiAutopay: isEmiAutopay,
        passesIncomeGate: true,
        billInfo: billInfo,
      );
    } catch (e) {
      return null;
    }
  }).toList();
}

String _subjectFromHeaders(List<MessageHeaderDto> headers) {
  return headers
      .firstWhere((h) => h.name.toLowerCase() == 'subject',
          orElse: () => MessageHeaderDto('', ''))
      .value;
}
