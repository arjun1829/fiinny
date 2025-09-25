// lib/services/sms/sms_ingestor.dart
import 'dart:collection';
import 'package:telephony/telephony.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../expense_service.dart';
import '../income_service.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';

import 'sms_permission_helper.dart';
import '../ingest_index_service.dart';
import '../ingest_filters.dart'; // uses: guessBankFromSms (be permissive; we won't call isLikelyPromo)
import '../tx_key.dart';
import '../ingest_state_service.dart';
import '../ingest_job_queue.dart';

class SmsIngestor {
  SmsIngestor._();
  static final SmsIngestor instance = SmsIngestor._();

  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool USE_SERVICE_WRITES = false;  // write via Firestore by default
  static const bool AUTO_POST_TXNS = true;       // create expenses/incomes immediately

  // Testing: pull a chunk of inbox regardless of cutoff
  static const bool TEST_MODE = true;
  static const int TEST_BACKFILL_DAYS = 100;
  static const int TEST_MAX_MSGBATCH = 4000;

  // debug logs
  static const bool _DEBUG_INGEST = true;
  void _log(String s) { if (_DEBUG_INGEST) print('[SmsIngestor] $s'); }

  final Telephony _telephony = Telephony.instance;
  final ExpenseService _expense = ExpenseService();
  final IncomeService _income = IncomeService();
  final IngestIndexService _index = IngestIndexService();

  // Recent event guard (OEMs sometimes double-fire callbacks)
  static const int _recentCap = 400;
  final ListQueue<String> _recent = ListQueue<String>(_recentCap);

  void init({
    ExpenseService? expenseService,
    IncomeService? incomeService,
    IngestIndexService? indexService,
    dynamic index, // legacy
  }) {
    // No-op; singletons already wired.
  }

  bool _seenRecently(String k) {
    if (_recent.contains(k)) return true;
    _recent.addLast(k);
    if (_recent.length > _recentCap) _recent.removeFirst();
    return false;
  }

  // ─────────────────────── Public API ─────────────────────────────────────────

  /// Permissive 100-day backfill for testing.
  Future<void> backfillLastNDaysForTesting({
    required String userPhone,
    int days = TEST_BACKFILL_DAYS,
  }) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) {
      _log('no SMS permission; skipping backfill');
      return;
    }

    final now = DateTime.now();
    final since = now.subtract(Duration(days: days));

    final msgs = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    int processed = 0;
    DateTime? newest;
    for (final m in msgs) {
      if (processed >= TEST_MAX_MSGBATCH) break;

      final ts = DateTime.fromMillisecondsSinceEpoch(
        m.date ?? now.millisecondsSinceEpoch,
      );
      if (ts.isBefore(since)) break;

      final body = m.body ?? '';
      if (_looksLikeOtpOnly(body)) continue; // drop pure OTPs, allow everything else

      try {
        await _handleOne(
          userPhone: userPhone,
          body: body,
          ts: ts,
          address: m.address,
          ingestState: null, // ignore cutoff in TEST_MODE inside handler
        );
        processed++;
        if (newest == null || ts.isAfter(newest)) newest = ts;
      } catch (e) {
        _log('backfill error: $e');
      }
    }

    if (newest != null) {
      await IngestStateService.instance.setProgress(userPhone, lastSmsTs: newest);
    }
    _log('backfill done: processed=$processed newest=$newest');
  }

  Future<void> initialBackfill({
    required String userPhone,
    int newerThanDays = 1000,
  }) async {
    if (TEST_MODE) {
      return backfillLastNDaysForTesting(userPhone: userPhone, days: TEST_BACKFILL_DAYS);
    }

    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final state = await IngestStateService.instance.ensureCutoff(userPhone);
    final now = DateTime.now();
    final deviceCutoff = now.subtract(Duration(days: newerThanDays));

    final msgs = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    DateTime? lastSeen;
    for (final m in msgs) {
      final ts = DateTime.fromMillisecondsSinceEpoch(
        m.date ?? now.millisecondsSinceEpoch,
      );
      if (ts.isBefore(deviceCutoff)) break;

      await _handleOne(
        userPhone: userPhone,
        body: m.body ?? '',
        ts: ts,
        address: m.address,
        ingestState: state,
      );

      if (lastSeen == null || ts.isAfter(lastSeen)) lastSeen = ts;
    }

    if (lastSeen != null) {
      await IngestStateService.instance.setProgress(userPhone, lastSmsTs: lastSeen);
    }
  }

  Future<void> startRealtime({required String userPhone}) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    try {
      _telephony.listenIncomingSms(
        onNewMessage: (SmsMessage m) async {
          final body = m.body ?? '';
          final ts = DateTime.fromMillisecondsSinceEpoch(
            m.date ?? DateTime.now().millisecondsSinceEpoch,
          );
          final localKey = '${ts.millisecondsSinceEpoch}|${(m.address ?? '')}|${body.hashCode}';
          if (_seenRecently(localKey)) return;

          final st = await IngestStateService.instance.get(userPhone);
          await _handleOne(
            userPhone: userPhone,
            body: body,
            ts: ts,
            address: m.address,
            ingestState: st,
          );

          await IngestStateService.instance.setProgress(userPhone, lastSmsTs: ts);
        },
        listenInBackground: true,
      );
    } catch (_) {
      // some OEMs restrict background listeners
    }
  }

  Future<void> syncDelta({
    required String userPhone,
    int? overlapHours,
    int? lookbackHours,
  }) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final overlap = overlapHours ?? lookbackHours ?? 24;

    final st = await IngestStateService.instance.get(userPhone);
    final now = DateTime.now();

    DateTime since;
    try {
      final last = (st as dynamic)?.lastSmsTs;
      if (last is Timestamp) {
        since = last.toDate().subtract(Duration(hours: overlap));
      } else if (last is DateTime) {
        since = last.subtract(Duration(hours: overlap));
      } else {
        since = now.subtract(const Duration(days: 1000));
      }
    } catch (_) {
      since = now.subtract(const Duration(days: 1000));
    }

    final msgs = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    DateTime? lastSeen;
    for (final m in msgs) {
      final ts = DateTime.fromMillisecondsSinceEpoch(
        m.date ?? now.millisecondsSinceEpoch,
      );
      if (ts.isBefore(since)) break;

      final localKey = '${ts.millisecondsSinceEpoch}|${(m.address ?? '')}|${(m.body ?? '').hashCode}';
      if (_seenRecently(localKey)) continue;

      await _handleOne(
        userPhone: userPhone,
        body: m.body ?? '',
        ts: ts,
        address: m.address,
        ingestState: st,
      );

      if (lastSeen == null || ts.isAfter(lastSeen)) lastSeen = ts;
    }

    if (lastSeen != null) {
      await IngestStateService.instance.setProgress(userPhone, lastSmsTs: lastSeen);
    }
  }

  // ─────────────────────── Core handler ───────────────────────────────────────

  Future<void> _handleOne({
    required String userPhone,
    required String body,
    required DateTime ts,
    String? address,
    dynamic ingestState,
  }) async {
    // Be permissive so we don't skip real transactions.
    // Only drop pure-OTP messages.
    if (_looksLikeOtpOnly(body)) return;

    _log('incoming ${ts.toIso8601String()} ${address ?? "?"}: ${_oneLine(body)}');

    // 1) Minimal parsing: amount + direction (debit/credit)
    final fx = _extractFx(body);
    final amountInr = fx == null ? _extractAmountInr(body) : null;
    final amount = amountInr ?? fx?['amount'] as double?;
    if (amount == null || amount <= 0) {
      _log('no valid amount; skip');
      return;
    }
    final direction = _inferDirection(body); // 'debit' | 'credit' | null
    if (direction == null) {
      _log('no clear direction; skip');
      return;
    }

    // 2) Bank + last4 + merchantKey (best-effort)
    final bank = guessBankFromSms(address: address, body: body);
    final last4 = RegExp(r'(?:XX|x{2,}|ending|acct|a/c)[^\d]*(\d{4})', caseSensitive: false)
        .firstMatch(body)
        ?.group(1);
    final merchant = _guessMerchant(body);
    final merchantKey = (merchant ?? last4 ?? bank ?? 'UNKNOWN').toUpperCase();

    // 3) Stable key + dedupe
    final key = buildTxKey(
      bank: bank,
      amount: amount,
      time: ts,
      type: direction,
      last4: last4,
    );
    final claimed = await _index.claim(userPhone, key, source: 'sms').catchError((_) => false);
    if (claimed != true) {
      _log('duplicate (key=$key) — skip');
      return;
    }

    // 4) Cutoff (ignored in TEST_MODE)
    final st = ingestState ?? await IngestStateService.instance.get(userPhone);
    final cutoff = _extractCutoff(st);
    final isAfterCutoff = TEST_MODE ? true : (cutoff == null ? true : ts.isAfter(cutoff));
    if (!isAfterCutoff) {
      _log('before cutoff — skip');
      return;
    }

    // 5) Clean user-facing note + source record
    final note = _cleanNoteSimple(body);
    final sourceMeta = {
      'type': 'sms',
      'raw': body,
      'rawPreview': _preview(body),
      'at': Timestamp.fromDate(ts),
      if (address != null) 'address': address,
      if (merchant != null) 'merchant': merchant,
      'txKey': key,
      'when': FieldValue.serverTimestamp(),
    };

    // 6) Create expense/income and enqueue Oracle job (with write-back routing)
    final docId = _docIdFromKey(key);
    final currency = (fx?['currency'] as String?) ?? 'INR';

    if (direction == 'debit') {
      final expRef = FirebaseFirestore.instance
          .collection('users').doc(userPhone)
          .collection('expenses').doc(docId);

      final e = ExpenseItem(
        id: expRef.id,
        type: 'SMS Debit',
        amount: amount,
        note: note,
        date: ts,
        payerId: userPhone,
        cardLast4: last4,
      );

      if (USE_SERVICE_WRITES) {
        await _expense.addExpense(userPhone, e);
      } else {
        await expRef.set(e.toJson(), SetOptions(merge: true));
      }

      await expRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchant != null) 'merchant': merchant,
        'txKey': key, // 👈 write at the root so the updater can find it
      }, SetOptions(merge: true));

      try {
        await IngestJobQueue.enqueue(
          userId: userPhone,
          txKey: key,
          rawText: body,
          amount: amount,
          currency: currency,
          timestamp: ts,
          source: 'sms',
          direction: 'debit',
          docId: docId,
          docCollection: 'expenses',
          docPath: 'users/$userPhone/expenses/$docId',
          enabled: true,
        );
      } catch (_) {}
    } else {
      final incRef = FirebaseFirestore.instance
          .collection('users').doc(userPhone)
          .collection('incomes').doc(docId);

      final i = IncomeItem(
        id: incRef.id,
        type: 'SMS Credit',
        amount: amount,
        note: note,
        date: ts,
        source: 'SMS',
      );

      if (USE_SERVICE_WRITES) {
        await _income.addIncome(userPhone, i);
      } else {
        await incRef.set(i.toJson(), SetOptions(merge: true));
      }

      await incRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchant != null) 'merchant': merchant,
      }, SetOptions(merge: true));

      try {
        await IngestJobQueue.enqueue(
          userId: userPhone,
          txKey: key,
          rawText: body,
          amount: amount,
          currency: currency,
          timestamp: ts,
          source: 'sms',
          direction: 'credit',
          docId: docId,
          docCollection: 'incomes',
          docPath: 'users/$userPhone/incomes/$docId',
          enabled: true,
        );
      } catch (_) {}
    }

    _log('WRITE type=$direction amt=$amount key=$key');
  }

  // ─────────────────────── Helpers ────────────────────────────────────────────

  DateTime? _extractCutoff(dynamic st) {
    try {
      final c = (st as dynamic)?.cutoff;
      if (c is DateTime) return c;
      if (c is Timestamp) return c.toDate();
    } catch (_) {}
    return null;
  }

  String _docIdFromKey(String key) {
    int hash = 5381;
    for (final code in key.codeUnits) {
      hash = ((hash << 5) + hash) + code;
    }
    final hex = (hash & 0x7fffffff).toRadixString(16);
    return 'ing_${hex}';
  }

  // Collapse to one line for logs
  String _oneLine(String s) => s.replaceAll('\n', ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

  // Very simple note cleaner (no ML/regex analyzer dependency)
  String _cleanNoteSimple(String raw) {
    var t = raw.trim();
    // remove obvious OTP lines
    t = t.replaceAll(RegExp(r'(^|\s)(OTP|One[-\s]?Time\s*Password)\b[^\n]*', caseSensitive: false), '');
    // collapse whitespace
    t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
    // keep it short
    if (t.length > 220) t = '${t.substring(0, 220)}…';
    return t;
  }

  String _preview(String raw) {
    var p = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (p.length > 80) p = '${p.substring(0, 80)}…';
    return p;
  }

  // INR amount like: ₹1,234.50 / INR 1234 / Rs 1,234 / rs.250
  double? _extractAmountInr(String text) {
    final patterns = <RegExp>[
      RegExp(r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\.\d{1,2})?)', caseSensitive: false),
      // fallback: "amount of 123.45"
      RegExp(r'\bamount\s+of\s+([0-9][\d,]*(?:\.\d{1,2})?)', caseSensitive: false),
    ];
    for (final re in patterns) {
      final m = re.firstMatch(text);
      if (m != null) {
        final numStr = (m.group(1) ?? '').replaceAll(',', '');
        final v = double.tryParse(numStr);
        if (v != null && v > 0) return v;
      }
    }
    return null;
  }

  /// FX examples: "Spent USD 23.6", "Transaction of EUR 12.00"
  Map<String, dynamic>? _extractFx(String text) {
    final pats = <RegExp>[
      RegExp(r'(spent|purchase|txn|transaction|charged)\s+(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)', caseSensitive: false),
      RegExp(r'\b(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)\b\s*(spent|purchase|txn|transaction|charged)', caseSensitive: false),
      RegExp(r'(txn|transaction)\s*of\s*(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)', caseSensitive: false),
    ];
    for (final re in pats) {
      final m = re.firstMatch(text);
      if (m != null) {
        final g = m.groups([1,2,3]);
        String cur; String amtStr;
        if (re.pattern.startsWith('(spent')) {
          cur = g[1]!.toUpperCase(); amtStr = g[2]!;
        } else if (re.pattern.startsWith(r'\b(usd')) {
          cur = g[0]!.toUpperCase(); amtStr = g[1]!;
        } else {
          cur = g[1]!.toUpperCase(); amtStr = g[2]!;
        }
        final amt = double.tryParse(amtStr);
        if (amt != null && amt > 0) return {'currency': cur, 'amount': amt};
      }
    }
    return null;
  }

  // infer debit/credit from common cues
  String? _inferDirection(String body) {
    final lower = body.toLowerCase();
    final isDR = RegExp(r'\bdr\b').hasMatch(lower);
    final isCR = RegExp(r'\bcr\b').hasMatch(lower);
    final debit = RegExp(
      r'\b(debit(?:ed)?|spent|purchase|paid|payment|pos|upi(?:\s*payment)?|imps|neft|rtgs|withdrawn|withdrawal|atm|charge[ds]?|recharge(?:d)?|bill\s*paid)\b',
      caseSensitive: false,
    ).hasMatch(lower);
    final credit = RegExp(
      r'\b(credit(?:ed)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    if ((debit || isDR) && !(credit || isCR)) return 'debit';
    if ((credit || isCR) && !(debit || isDR)) return 'credit';

    // both seen: pick first occurrence
    final dIdx = RegExp(r'debit|spent|purchase|paid|payment|dr', caseSensitive: false).firstMatch(lower)?.start ?? -1;
    final cIdx = RegExp(r'credit|received|rcvd|deposit|salary|refund|cr', caseSensitive: false).firstMatch(lower)?.start ?? -1;
    if (dIdx >= 0 && cIdx >= 0) return dIdx < cIdx ? 'debit' : 'credit';
    return null;
  }

  String? _guessMerchant(String body) {
    final t = body.toUpperCase();
    final known = <String>[
      'NETFLIX','AMAZON PRIME','PRIME VIDEO','SPOTIFY','YOUTUBE','GOOGLE *YOUTUBE',
      'APPLE.COM/BILL','APPLE','MICROSOFT','ADOBE','SWIGGY','ZOMATO','HOTSTAR','DISNEY+ HOTSTAR',
      'SONYLIV','AIRTEL','JIO','VI','HATHWAY','ACT FIBERNET','BOOKMYSHOW','BIGTREE','OLA','UBER',
      'IRCTC','REDBUS','AMAZON','FLIPKART','MEESHO','BLINKIT','ZEPTO'
    ];
    for (final k in known) { if (t.contains(k)) return k; }
    final m = RegExp(r'\b(for|towards|at)\b\s*([A-Z0-9\*\._\- ]{3,25})').firstMatch(t);
    return m?.group(2)?.trim();
  }

  bool _looksLikeOtpOnly(String body) {
    final lower = body.toLowerCase();
    if (RegExp(r'\botp\b', caseSensitive: false).hasMatch(lower)) {
      final hasTxnVerb = RegExp(
        r'\b(debit(?:ed)?|credit(?:ed)?|received|rcvd|deposit(?:ed)?|spent|purchase|paid|payment|withdrawn|transfer(?:red)?|txn|transaction)\b',
        caseSensitive: false,
      ).hasMatch(lower);
      if (!hasTxnVerb) return true;
    }
    return false;
  }
}
