// lib/services/gmail_service.dart
import 'dart:convert';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:googleapis/gmail/v1.dart' as gmail;
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/expense_item.dart';
import '../models/income_item.dart';

import './ingest_index_service.dart';
import './tx_key.dart';
import './ingest_state_service.dart';
import './ingest_job_queue.dart';

class GmailService {
  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool AUTO_POST_TXNS = true;      // create expenses/incomes immediately
  static const bool USE_SERVICE_WRITES = false; // write via Firestore set(merge)
  static const int DEFAULT_OVERLAP_HOURS = 24;

  // Testing backfill like SMS
  static const bool TEST_MODE = true;
  static const int TEST_BACKFILL_DAYS = 100;
  static const int PAGE_POOL = 10;

  // Debug logs
  static const bool _DEBUG = true;
  void _log(String s) { if (_DEBUG) print('[GmailService] $s'); }

  static final _scopes = [gmail.GmailApi.gmailReadonlyScope];
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: _scopes);
  GoogleSignInAccount? _currentUser;

  final IngestIndexService _index = IngestIndexService();

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    _currentUser = null;
  }

  // Legacy compat
  Future<void> fetchAndStoreTransactionsFromGmail(
      String userId, {
        int newerThanDays = 1000,
        int maxResults = 300,
      }) async {
    final st = await IngestStateService.instance.get(userId);
    final now = DateTime.now();
    DateTime since;
    try {
      final last = (st as dynamic)?.lastGmailTs;
      if (last is Timestamp) {
        since = last.toDate().subtract(const Duration(hours: DEFAULT_OVERLAP_HOURS));
      } else if (last is DateTime) {
        since = last.subtract(const Duration(hours: DEFAULT_OVERLAP_HOURS));
      } else {
        since = now.subtract(Duration(days: newerThanDays));
      }
    } catch (_) {
      since = now.subtract(Duration(days: newerThanDays));
    }
    await _fetchAndStage(userId: userId, since: since, pageSize: maxResults);
  }

  // ── Entry points ───────────────────────────────────────────────────────────

  Future<void> initialBackfill({
    required String userId,
    int newerThanDays = 1000,
    int pageSize = 500,
  }) async {
    await IngestStateService.instance.ensureCutoff(userId);

    if (TEST_MODE) {
      final since = DateTime.now().subtract(Duration(days: TEST_BACKFILL_DAYS));
      await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);
      return;
    }

    final since = DateTime.now().subtract(Duration(days: newerThanDays));
    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);
  }

  /// Catch-up that scans (lastGmailTs - overlap) → now
  Future<void> syncDelta({
    required String userId,
    int overlapHours = DEFAULT_OVERLAP_HOURS,
    int pageSize = 300,
    int fallbackDaysIfNoWatermark = 1000,
  }) async {
    final st = await IngestStateService.instance.get(userId);
    final now = DateTime.now();

    DateTime since;
    try {
      final last = (st as dynamic)?.lastGmailTs;
      if (last is Timestamp) {
        since = last.toDate().subtract(Duration(hours: overlapHours));
      } else if (last is DateTime) {
        since = last.subtract(Duration(hours: overlapHours));
      } else {
        since = now.subtract(Duration(days: fallbackDaysIfNoWatermark));
      }
    } catch (_) {
      since = now.subtract(Duration(days: fallbackDaysIfNoWatermark));
    }

    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);
  }

  // ── Main fetch + stage ─────────────────────────────────────────────────────
  Future<void> _fetchAndStage({
    required String userId,
    required DateTime since,
    int pageSize = 300,
  }) async {
    // Sign-in (silent → interactive)
    _currentUser = await _googleSignIn.signInSilently();
    _currentUser ??= await _googleSignIn.signIn();
    if (_currentUser == null) throw Exception('Google Sign-In failed');

    final headers = await _currentUser!.authHeaders;
    final gmailApi = gmail.GmailApi(_GoogleAuthClient(headers));

    final newerDays = _daysBetween(DateTime.now(), since).clamp(0, 36500);
    // Broad query; we hard-filter by internalDate afterwards
    final baseQ =
        '(bank OR card OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR payment OR UPI OR refund OR salary OR invoice OR receipt) '
        'newer_than:${newerDays}d '
        '-("statement generated" OR e-statement OR "your bill")';

    String? pageToken;
    DateTime? newestTouched;

    while (true) {
      final list = await gmailApi.users.messages.list(
        'me',
        maxResults: pageSize.clamp(1, 500),
        q: baseQ,
        pageToken: pageToken,
      );

      final msgs = list.messages ?? [];
      if (msgs.isEmpty) break;

      for (var i = 0; i < msgs.length; i += PAGE_POOL) {
        final slice = msgs.sublist(i, (i + PAGE_POOL).clamp(0, msgs.length));
        await Future.wait(slice.map((m) async {
          try {
            final msg = await gmailApi.users.messages.get('me', m.id!);
            final tsMs = int.tryParse(msg.internalDate ?? '0') ?? 0;
            final dt = DateTime.fromMillisecondsSinceEpoch(
              tsMs > 0 ? tsMs : DateTime.now().millisecondsSinceEpoch,
            );
            if (dt.isBefore(since)) return;
            final touched = await _handleMessage(userId: userId, msg: msg);
            if (touched != null &&
                (newestTouched == null || touched.isAfter(newestTouched!))) {
              newestTouched = touched;
            }
          } catch (e) {
            _log('message error: $e'); // swallow single-message errors
          }
        }));
      }

      pageToken = list.nextPageToken;
      if (pageToken == null) break;
    }

    if (newestTouched != null) {
      await IngestStateService.instance.setProgress(userId, lastGmailTs: newestTouched);
    }
  }

  // returns message DateTime if ingested, else null
  Future<DateTime?> _handleMessage({
    required String userId,
    required gmail.Message msg,
  }) async {
    final subject = _getHeader(msg.payload?.headers, 'subject') ?? '';
    final bodyText = _extractPlainText(msg.payload) ?? (msg.snippet ?? '');
    final combined = (subject + '\n' + bodyText).trim();
    if (combined.isEmpty) return null;
    if (_looksLikeOtpOnly(combined)) return null; // only strict drop

    final tsMs = int.tryParse(msg.internalDate ?? '0') ?? DateTime.now().millisecondsSinceEpoch;
    final msgDate = DateTime.fromMillisecondsSinceEpoch(tsMs);

    final emailDomain = _fromDomain(msg.payload?.headers);
    final amountFx = _extractFx(combined);
    final amountInr = amountFx == null ? _extractAnyInr(combined) : null;
    final amount = amountInr ?? amountFx?['amount'] as double?;
    if (amount == null || amount <= 0) return null;

    final direction = _inferDirection(combined); // 'debit' | 'credit' | null
    if (direction == null) return null;

    final bank = _guessBankFromHeaders(msg.payload?.headers);
    final last4 = _extractCardLast4(combined);
    final merchant = _guessMerchant(combined);
    final merchantKey = (merchant ?? emailDomain ?? last4 ?? bank ?? 'UNKNOWN').toUpperCase();

    final key = buildTxKey(
      bank: bank,
      amount: amount,
      time: msgDate,
      type: direction,
      last4: last4,
    );

    bool claimed = true;
    try {
      final res = await _index.claim(userId, key, source: 'gmail');
      claimed = (res is bool) ? res : true;
    } catch (_) { claimed = false; }
    if (!claimed) return null;

    final note = _cleanNoteSimple(combined);
    final sourceMeta = {
      'type': 'gmail',
      'gmailId': msg.id,
      'threadId': msg.threadId,
      'internalDateMs': tsMs,
      'raw': combined,
      'rawPreview': _preview(combined),
      'emailDomain': emailDomain,
      'when': Timestamp.fromDate(DateTime.now()),
      'txKey': key,
      if (merchant != null) 'merchant': merchant,
      if (amountFx != null) 'fxOriginal': amountFx,
    };

    final docId = _docIdFromKey(key);
    final currency = (amountFx?['currency'] as String?) ?? 'INR';

    if (direction == 'debit') {
      final expRef = FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('expenses').doc(docId);

      final e = ExpenseItem(
        id: expRef.id,
        type: 'Email Debit',
        amount: amount,
        note: note,
        date: msgDate,
        payerId: userId,
        cardLast4: last4,
      );

      if (USE_SERVICE_WRITES) {
        await expRef.set(e.toJson(), SetOptions(merge: true));
      } else {
        await expRef.set(e.toJson(), SetOptions(merge: true));
      }
      await expRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchant != null) 'merchant': merchant,
      }, SetOptions(merge: true));

      // enqueue LLM categorization with write-back routing (EXPENSE)
      try {
        await IngestJobQueue.enqueue(
          userId: userId,            // preferred user identifier
          txKey: key,
          rawText: combined,
          amount: amount,
          currency: currency,
          timestamp: msgDate,
          source: 'email',

          // routing for the worker
          direction: 'debit',
          docId: docId,
          docCollection: 'expenses',
          docPath: 'users/$userId/expenses/$docId',

          enabled: true,
        );
      } catch (_) {}

    } else {
      final incRef = FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('incomes').doc(docId);

      final i = IncomeItem(
        id: incRef.id,
        type: 'Email Credit',
        amount: amount,
        note: note,
        date: msgDate,
        source: 'Email',
      );

      if (USE_SERVICE_WRITES) {
        await incRef.set(i.toJson(), SetOptions(merge: true));
      } else {
        await incRef.set(i.toJson(), SetOptions(merge: true));
      }
      await incRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchant != null) 'merchant': merchant,
        'txKey': key, // 👈 same here
      }, SetOptions(merge: true));

      // enqueue LLM categorization with write-back routing (INCOME)
      try {
        await IngestJobQueue.enqueue(
          userId: userId,            // preferred user identifier
          txKey: key,
          rawText: combined,
          amount: amount,
          currency: currency,
          timestamp: msgDate,
          source: 'email',

          // routing for the worker
          direction: 'credit',
          docId: docId,
          docCollection: 'incomes',
          docPath: 'users/$userId/incomes/$docId',

          enabled: true,
        );
      } catch (_) {}

    }

    _log('WRITE email type=$direction amt=$amount key=$key domain=${emailDomain ?? "-"}');
    return msgDate;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  int _daysBetween(DateTime a, DateTime b) {
    final diff = a.toUtc().difference(b.toUtc()).inDays;
    return diff.abs();
  }

  String? _getHeader(List<gmail.MessagePartHeader>? headers, String name) {
    if (headers == null) return null;
    final h = headers.firstWhere(
          (x) => (x.name?.toLowerCase() == name.toLowerCase()),
      orElse: () => gmail.MessagePartHeader(),
    );
    return h.value;
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

    for (final p in part.parts!) {
      if ((p.mimeType ?? '').startsWith('text/plain')) {
        final d = decodeData(p.body?.data);
        if (d != null) return d;
      }
    }
    for (final p in part.parts!) {
      if ((p.mimeType ?? '').startsWith('text/html')) {
        final d = decodeData(p.body?.data);
        if (d != null) return _stripHtml(d);
      }
    }
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
        .replaceAll(RegExp(r'<[^>]+>'), ' ');
    return text.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  String? _guessBankFromHeaders(List<gmail.MessagePartHeader>? headers) {
    if (headers == null) return null;
    String? val(String name) => headers
        .firstWhere((h) => (h.name?.toLowerCase() == name),
        orElse: () => gmail.MessagePartHeader())
        .value;
    final candidates = [
      val('from'),
      val('return-path'),
      val('x-original-from'),
      val('reply-to'),
    ].whereType<String>().map((s) => s.toLowerCase()).toList();

    bool has(String k) => candidates.any((s) => s.contains(k));
    if (has('hdfc')) return 'HDFC';
    if (has('axis')) return 'Axis';
    if (has('icici')) return 'ICICI';
    if (has('sbi')) return 'SBI';
    if (has('kotak')) return 'Kotak';
    if (has('yesbank') || has('yes bank')) return 'YES';
    if (has('federal')) return 'Federal';
    if (has('idfc')) return 'IDFC';
    if (has('bankofbaroda') || has('bob')) return 'BOB';
    return null;
  }

  String? _fromDomain(List<gmail.MessagePartHeader>? headers) {
    if (headers == null) return null;
    final from = _getHeader(headers, 'from') ?? '';
    final m = RegExp(r'[<\s]([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})[>\s]?', caseSensitive: false).firstMatch(from);
    if (m != null) return (m.group(2) ?? '').toLowerCase();
    final reply = _getHeader(headers, 'reply-to') ?? _getHeader(headers, 'return-path') ?? '';
    final m2 = RegExp(r'@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', caseSensitive: false).firstMatch(reply);
    return m2?.group(1)?.toLowerCase();
  }

  String? _extractCardLast4(String text) {
    final re = RegExp(
      r'(?:ending(?:\s*in)?|xx+|x{2,}|XXXX|XX|last\s*digits|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})',
      caseSensitive: false,
    );
    return re.firstMatch(text)?.group(1);
  }

  // INR amount like: ₹1,234.50 / INR 1234 / Rs 1,234 / rs.250
  double? _extractAnyInr(String text) {
    final rxs = <RegExp>[
      RegExp(r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\.\d{1,2})?)', caseSensitive: false),
      RegExp(r'\bamount\s+of\s+([0-9][\d,]*(?:\.\d{1,2})?)', caseSensitive: false),
    ];
    for (final rx in rxs) {
      final m = rx.firstMatch(text);
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
  String? _inferDirection(String text) {
    final lower = text.toLowerCase();
    final isDR = RegExp(r'\bdr\b').hasMatch(lower);
    final isCR = RegExp(r'\bcr\b').hasMatch(lower);
    final debit = RegExp(
      r'\b(debit(?:ed)?|spent|withdrawn|purchase|paid|payment|transferred|deducted|atm\s*withdrawal|pos|upi)\b',
      caseSensitive: false,
    ).hasMatch(lower);
    final credit = RegExp(
      r'\b(credit(?:ed)?|received|deposited|salary|refund|reversal|cashback|interest)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    if ((debit || isDR) && !(credit || isCR)) return 'debit';
    if ((credit || isCR) && !(debit || isDR)) return 'credit';

    final dIdx = RegExp(r'debit|spent|withdrawn|purchase|paid|payment|dr', caseSensitive: false).firstMatch(lower)?.start ?? -1;
    final cIdx = RegExp(r'credit|received|deposited|salary|refund|cr', caseSensitive: false).firstMatch(lower)?.start ?? -1;
    if (dIdx >= 0 && cIdx >= 0) return dIdx < cIdx ? 'debit' : 'credit';
    return null;
  }

  String? _guessMerchant(String text) {
    final t = text.toUpperCase();
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
        r'(debit|credit|spent|purchase|paid|payment|withdrawn|transfer|txn|transaction)',
        caseSensitive: false,
      ).hasMatch(lower);
      if (!hasTxnVerb) return true;
    }
    return false;
  }

  String _cleanNoteSimple(String raw) {
    var t = raw.trim();
    // remove obvious OTP lines
    t = t.replaceAll(RegExp(r'(^|\s)(OTP|One[-\s]?Time\s*Password)\b[^\n]*', caseSensitive: false), '');
    t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (t.length > 220) t = '${t.substring(0, 220)}…';
    return t;
  }

  String _preview(String raw) {
    var p = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (p.length > 80) p = '${p.substring(0, 80)}…';
    return p;
  }

  // Deterministic id from txKey (djb2)
  String _docIdFromKey(String key) {
    int hash = 5381;
    for (final code in key.codeUnits) {
      hash = ((hash << 5) + hash) + code;
    }
    final hex = (hash & 0x7fffffff).toRadixString(16);
    return 'ing_${hex}';
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
