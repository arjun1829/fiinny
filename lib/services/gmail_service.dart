// lib/services/gmail_service.dart
import 'dart:convert';
import 'dart:math' as math;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:googleapis/gmail/v1.dart' as gmail;
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/transaction_item.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';

import './ingest_index_service.dart';
import './tx_key.dart';

import '../brain/brain_enricher_service.dart';
import './ingest_state_service.dart';

// 🔍 Parser + suggestions (no hard category writes)
import './tx_analyzer.dart';

// 🧼 Clean user-facing notes
import './note_sanitizer.dart';

/// GmailService (trust-first parser + suggester)
/// - Watermark (lastGmailTs) + overlap to avoid missing emails
/// - Paginates broadly; filters locally by internalDate >= since
/// - TxAnalyzer on Subject+Body (+ domain) for amount/merchant/channel
/// - Category only suggested (stored as suggestedCategory + confidence)
/// - Clean, compact notes; full raw kept under sourceRecord
/// - Cross-source dedupe via IngestIndexService.claim(txKey)
/// - Deterministic Firestore doc IDs to avoid duplicate docs
class GmailService {
  // Behavior toggles
  static const bool AUTO_POST_TXNS = true;   // post if direction + amount found
  static const bool USE_SERVICE_WRITES = false; // mirror SMS style
  static const int DEFAULT_OVERLAP_HOURS = 24;

  static final _scopes = [gmail.GmailApi.gmailReadonlyScope];
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: _scopes);
  GoogleSignInAccount? _currentUser;

  final IngestIndexService _index = IngestIndexService();

  // TxAnalyzer (ML Kit optional; falls back to regex internally)
  final TxAnalyzer _analyzer = TxAnalyzer(
    config: TxAnalyzerConfig(
      enableMlKit: true,
      autoApproveThreshold: 0.90,
      minHighPrecisionConf: 0.88,
    ),
  );

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    _currentUser = null;
  }

  // 🔙 Back-compat for old call sites (Dashboard & SyncCoordinator)
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

    await _fetchAndStage(
      userId: userId,
      since: since,
      pageSize: maxResults,
    );
  }

  // ---------------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------------

  Future<void> initialBackfill({
    required String userId,
    int newerThanDays = 1000,
    int pageSize = 500,
  }) async {
    await IngestStateService.instance.ensureCutoff(userId);
    // Since we have no watermark yet, compute a since bound from now - newerThanDays
    final since = DateTime.now().subtract(Duration(days: newerThanDays));
    await _fetchAndStage(
      userId: userId,
      since: since,
      pageSize: pageSize,
    );
    // Watermark is moved forward during processing (lastGmailTs)
  }

  /// Safe catch-up that **never misses**:
  /// scans from (lastGmailTs - overlap) to now.
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

    await _fetchAndStage(
      userId: userId,
      since: since,
      pageSize: pageSize,
    );
  }

  // ---------------------------------------------------------------------------
  // Main fetch + stage (pagination + concurrency + since filter)
  // ---------------------------------------------------------------------------
  Future<void> _fetchAndStage({
    required String userId,
    required DateTime since,
    int pageSize = 300,
  }) async {
    _currentUser = await _googleSignIn.signIn();
    if (_currentUser == null) throw Exception("Sign in failed");
    final headers = await _currentUser!.authHeaders;
    final gmailApi = gmail.GmailApi(_GoogleAuthClient(headers));

    // Broad query to catch transactional emails; we'll locally filter by since
    // Note: newer_than is coarse (days). We still check internalDate >= since in code.
    final newerDays = _daysBetween(DateTime.now(), since).clamp(0, 36500);
    final baseQ =
        '(bank OR card OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR payment OR UPI OR refund OR salary OR invoice OR receipt) '
        'newer_than:${newerDays}d '
        '-("statement generated" OR e-statement OR "your bill")';

    String? pageToken;
    const pool = 10;
    DateTime? newestTouched;

    while (true) {
      final list = await gmailApi.users.messages.list(
        'me',
        maxResults: pageSize.clamp(1, 500),
        q: baseQ,
        // labelIds: ['INBOX'], // optional: include PROMOTIONS if you want
      );

      final msgs = list.messages ?? [];
      if (msgs.isEmpty) break;

      for (var i = 0; i < msgs.length; i += pool) {
        final slice = msgs.sublist(i, (i + pool).clamp(0, msgs.length));
        final results = await Future.wait(slice.map((m) async {
          try {
            final msg = await gmailApi.users.messages.get('me', m.id!);
            // Local since bound using internalDate (ms since epoch)
            final tsMs = int.tryParse(msg.internalDate ?? '0') ?? 0;
            final dt = DateTime.fromMillisecondsSinceEpoch(
              tsMs > 0 ? tsMs : DateTime.now().millisecondsSinceEpoch,
            );
            if (dt.isBefore(since)) {
              return 0; // skip older than since (overlap protects)
            }
            final touched = await _handleMessage(userId: userId, msg: msg);
            if (touched != null &&
                (newestTouched == null || touched.isAfter(newestTouched!))) {
              newestTouched = touched;
            }
            return 1;
          } catch (_) {
            return 0;
          }
        }));
        // results used only for progress/debug if needed
      }

      pageToken = list.nextPageToken;
      if (pageToken == null) break;
    }

    // Move watermark
    if (newestTouched != null) {
      await IngestStateService.instance.setProgress(userId, lastGmailTs: newestTouched);
    }
  }

  // returns the message DateTime if we ingested, else null
  Future<DateTime?> _handleMessage({
    required String userId,
    required gmail.Message msg,
  }) async {
    final subject = _getHeader(msg.payload?.headers, 'subject') ?? '';
    final bodyText = _extractPlainText(msg.payload) ?? (msg.snippet ?? '');
    final combined = (subject + '\n' + bodyText).trim();

    if (combined.isEmpty) return null;
    if (_isPureBalanceInfo(combined) || _looksLikeOtpOnly(combined)) return null;

    final tsMs = int.tryParse(msg.internalDate ?? '0') ?? DateTime.now().millisecondsSinceEpoch;
    final msgDate = DateTime.fromMillisecondsSinceEpoch(tsMs);

    // Email domain (for high-precision domain → category/merchant)
    final emailDomain = _fromDomain(msg.payload?.headers);

    // 1) Parse + suggest
    final analysis = await _analyzer.analyze(rawText: combined, emailDomain: emailDomain);
    final parsed = analysis.parse;

    // Prefer analyzer amount; fallback to simple INR finder if needed
    double? amountInr = parsed.amount;
    Map<String, dynamic>? fx;
    if (amountInr == null) {
      final fall = _extractAnyInr(combined);
      amountInr = fall;
      if (amountInr == null) {
        fx = _extractFx(combined);
      }
    }
    if (amountInr == null && fx == null) return null;
    if (amountInr != null && amountInr <= 0.0) return null;

    // Direction: analyzer debit hint, override with strong credit cue
    String? type = parsed.isDebit ? 'debit' : null;
    final looksCredit = RegExp(
      r'(credited|received|deposited|salary|refund|cashback|interest\s*credited)',
      caseSensitive: false,
    ).hasMatch(combined);
    final looksDebit = RegExp(
      r'(debited|spent|withdrawn|purchase|paid|payment|transferred|deducted|atm\s*withdrawal|pos|upi)',
      caseSensitive: false,
    ).hasMatch(combined);

    if (!parsed.isDebit && looksCredit && !looksDebit) {
      type = 'credit';
    } else if (looksDebit && looksCredit) {
      final dIdx = combined.indexOf(RegExp(
          r'(debited|spent|withdrawn|purchase|paid|payment|transferred|deducted|atm\s*withdrawal|pos|upi)',
          caseSensitive: false));
      final cIdx = combined.indexOf(RegExp(
          r'(credited|received|deposited|salary|refund|cashback|interest\s*credited)',
          caseSensitive: false));
      if (dIdx >= 0 && cIdx >= 0) type = dIdx < cIdx ? 'debit' : 'credit';
    }
    if (type == null && amountInr == null) return null;

    // Merchant from analyzer / domain
    String? merchant = parsed.merchant ?? _merchantFromDomain(emailDomain);

    // Quick-commerce override (subject/body/domain)
    final qc = _quickCommerceSuggest(
      combined,
      domain: emailDomain,
      seedMerchant: merchant,
    );
    // Category suggestion (do NOT write 'category' automatically)
    var suggestedCategory = analysis.category.category;
    var categoryConfidence = analysis.category.confidence ?? 0.0;
    var categorySource = _topSignal(analysis.category.reasons);

    if (qc != null) {
      if ((suggestedCategory == null) || (categoryConfidence < 0.85)) {
        suggestedCategory = qc['category'] as String; // "Online Groceries"
        categorySource = 'quickCommerceRule';
      }
      categoryConfidence = math.max(categoryConfidence, (qc['confidence'] as double? ?? 0.0));
      merchant ??= qc['merchant'] as String?;
    }

    final bank = _guessBankFromHeaders(msg.payload?.headers);
    final last4 = _extractCardLast4(combined);
    final merchantKey = (merchant ?? emailDomain ?? last4 ?? bank ?? 'UNKNOWN').toUpperCase();

    // Cross-source dedupe key
    final key = buildTxKey(
      bank: bank,
      amount: amountInr ?? fx?['amount'],
      time: msgDate,
      type: (type ?? 'unknown'),
      last4: last4,
    );

    // Dedupe across sources
    bool claimed = true;
    try {
      final res = await _index.claim(userId, key, source: 'gmail');
      claimed = (res is bool) ? res : true;
    } catch (_) {
      claimed = false;
    }
    if (!claimed) return null;

    // Brain enrichment (use raw combined for semantics)
    Map<String, dynamic>? brain;
    try {
      if (type == 'debit' || type == null) {
        final e = ExpenseItem(
          id: 'probe',
          type: 'Email Debit',
          amount: amountInr ?? (fx?['amount'] ?? 0.0),
          note: combined,
          date: msgDate,
          payerId: userId,
          cardLast4: last4,
        );
        brain = BrainEnricherService().buildExpenseBrainUpdate(e);
      } else {
        final i = IncomeItem(
          id: 'probe',
          type: 'Email Credit',
          amount: amountInr ?? 0.0,
          note: combined,
          date: msgDate,
          source: 'Email',
        );
        brain = BrainEnricherService().buildIncomeBrainUpdate(i);
      }
    } catch (_) {}
    if (qc != null) {
      brain ??= {};
      brain!.addAll({
        'isQuickCommerce': true,
        'categoryHint': 'Online Groceries',
      });
    }

    // Clean user-facing note
    final clean = NoteSanitizer.build(raw: combined, parse: parsed);

    // Source metadata
    final sourceMeta = {
      'type': 'gmail',
      'gmailId': msg.id,
      'threadId': msg.threadId,
      'internalDateMs': tsMs,
      'raw': combined,                 // full raw for audit
      'rawPreview': clean.rawPreview,  // short, cleaned
      'emailDomain': emailDomain,
      'analyzer': {
        'isUPI': parsed.isUPI,
        'isP2M': parsed.isP2M,
        'reasons': analysis.category.reasons,
        'suggestedCategory': suggestedCategory,
        'categoryConfidence': categoryConfidence,
        'categorySource': categorySource,
      },
      'sanitizer': {
        'removedLines': clean.removedLines,
        'tags': clean.tags,
      },
      'when': Timestamp.fromDate(DateTime.now()),
      if (fx != null) 'fxOriginal': fx,
      if (merchant != null) 'merchant': merchant,
      if (qc != null) 'merchantTags': (qc['tags'] as List<String>),
    };

    // Auto-post gate
    final canAutopost = AUTO_POST_TXNS
        && (type != null)
        && ((amountInr != null) || (fx != null));

    final docId = _docIdFromKey(key);
    if (canAutopost) {
      if (type == 'debit') {
        final expRef = FirebaseFirestore.instance
            .collection('users').doc(userId)
            .collection('expenses').doc(docId);
        final e = ExpenseItem(
          id: expRef.id,
          type: 'Email Debit',
          amount: (amountInr ?? fx?['amount'])!,
          note: clean.note, // cleaned note
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
          // Suggestion-only fields
          'suggestedCategory': suggestedCategory,
          'categoryConfidence': categoryConfidence,
          'categorySource': categorySource,
          'category': null,
          if (brain != null) ...brain,
        }, SetOptions(merge: true));
      } else {
        final incRef = FirebaseFirestore.instance
            .collection('users').doc(userId)
            .collection('incomes').doc(docId);
        final i = IncomeItem(
          id: incRef.id,
          type: 'Email Credit',
          amount: (amountInr ?? fx?['amount'])!,
          note: clean.note, // cleaned note
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
          // Suggestion-only fields
          'suggestedCategory': suggestedCategory,
          'categoryConfidence': categoryConfidence,
          'categorySource': categorySource,
          'category': null,
          if (brain != null) ...brain,
        }, SetOptions(merge: true));
      }
    }

    // Move watermark forward to this message time (the newest we touched in caller)
    return msgDate;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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
        .firstWhere(
          (h) => (h.name?.toLowerCase() == name),
      orElse: () => gmail.MessagePartHeader(),
    )
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
    // Extract domain from "Name <user@domain.com>" or plain "user@domain.com"
    final m = RegExp(r'[<\s]([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})[>\s]?', caseSensitive: false).firstMatch(from);
    if (m != null) return (m.group(2) ?? '').toLowerCase();
    // Fallback: reply-to or return-path
    final reply = _getHeader(headers, 'reply-to') ?? _getHeader(headers, 'return-path') ?? '';
    final m2 = RegExp(r'@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', caseSensitive: false).firstMatch(reply);
    return m2?.group(1)?.toLowerCase();
  }

  String? _extractCardLast4(String text) {
    final re = RegExp(
      r'(?:ending(?:\s*in)?|xx+|x{2,}|XXXX|XX|last\s*digits|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})',
      caseSensitive: false,
    );
    final m = re.firstMatch(text);
    return m != null ? m.group(1) : null;
  }

  // Simple INR finder used as fallback when analyzer couldn't
  double? _extractAnyInr(String text) {
    final m = RegExp(r'(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)', caseSensitive: false).firstMatch(text);
    if (m == null) return null;
    final raw = (m.group(1) ?? '').replaceAll(',', '');
    return double.tryParse(raw);
  }

  /// FX fallback (we don't auto-post FX-only anyway)
  Map<String, dynamic>? _extractFx(String text) {
    final fx = RegExp(r'\b(usd|eur|gbp|aed|aud|cad|sgd|jpy)\s*([0-9]+(?:\.[0-9]+)?)\b',
        caseSensitive: false).firstMatch(text);
    if (fx != null) {
      final cur = fx.group(1)!.toUpperCase();
      final amt = double.tryParse(fx.group(2)!);
      if (amt != null) return {'currency': cur, 'amount': amt};
    }
    return null;
  }

  bool _isPureBalanceInfo(String body) {
    final lower = body.toLowerCase();
    final hasBalanceWords = RegExp(
      r'(available\s*limit|avl\s*limit|available\s*balance|account\s*balance|fund\s*bal|securities\s*bal|\bbal\b)',
      caseSensitive: false,
    ).hasMatch(lower);
    final hasTxnVerb = RegExp(
      r'(debit|credit|spent|purchase|paid|withdrawn|received|salary|cashback|refund|txn|transaction)',
      caseSensitive: false,
    ).hasMatch(lower);
    final isReporty = RegExp(r'\b(statement|report(ed)?)\b', caseSensitive: false).hasMatch(lower);
    return (hasBalanceWords && !hasTxnVerb) || (isReporty && !hasTxnVerb);
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

  // Deterministic doc id derived from txKey (simple djb2)
  String _docIdFromKey(String key) {
    int hash = 5381;
    for (final code in key.codeUnits) {
      hash = ((hash << 5) + hash) + code; // hash * 33 + code
    }
    final hex = (hash & 0x7fffffff).toRadixString(16);
    return 'ing_${hex}';
  }

  String _topSignal(Map<String, double> r) {
    if (r.isEmpty) return 'none';
    final list = r.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return list.first.key;
  }

  // ---------------------------------------------------------------------------
  // Quick-commerce helpers (regex + domain canonicalization)
  // ---------------------------------------------------------------------------

  String? _merchantFromDomain(String? domain) {
    if (domain == null) return null;
    final d = domain.toLowerCase();
    // conservative mapping by known domains
    if (d.contains('blinkit') || d.contains('grofers')) return 'Blinkit';
    if (d.contains('zepto')) return 'Zepto';
    if (d.contains('swiggy') && d.contains('instamart')) return 'Swiggy Instamart';
    if (d.contains('bigbasket') || d.contains('bbnow') || d.contains('bbdaily')) return 'BigBasket';
    if (d.contains('dmart')) return 'DMart';
    if (d.contains('starmarket') || d.contains('starbazaar')) return 'Star Bazaar';
    if (d.contains('ratnadeep')) return 'Ratnadeep';
    if (d.contains('jiomart')) return 'JioMart';
    if (d.contains('reliance') && (d.contains('smart') || d.contains('fresh'))) return 'Reliance Smart Bazaar';
    if (d.contains('morestore') || d.contains('more-retail')) return 'More Supermarket';
    if (d.contains('spencers')) return "Spencer's";
    if (d.contains('naturesbasket')) return "Nature's Basket";
    if (d.contains('licious')) return 'Licious';
    if (d.contains('freshtohome')) return 'FreshToHome';
    if (d.contains('zomato') && (d.contains('market') || d.contains('instant'))) return 'Zomato Market';
    return null;
  }

  /// Detect quick-commerce merchants in text and/or by domain.
  Map<String, dynamic>? _quickCommerceSuggest(
      String text, {
        String? domain,
        String? seedMerchant,
      }) {
    final u = text.toUpperCase();
    final pairs = <MapEntry<RegExp, String>>[
      MapEntry(RegExp(r"\bBLINKIT\b|\bGROFERS\b"), "Blinkit"),
      MapEntry(RegExp(r"\bZEPTO\b"), "Zepto"),
      MapEntry(RegExp(r"\bSWIGGY\s*INSTAMART\b|\bINSTAMART\b"), "Swiggy Instamart"),
      MapEntry(RegExp(r"\bBIG\s*BASKET\b|\bBIGBASKET\b|\bBB\s*DAILY\b"), "BigBasket"),
      MapEntry(RegExp(r"\bDMART\b"), "DMart"),
      MapEntry(RegExp(r"\bSTAR\s*BAZAAR\b|\bSTAR\s*BAZAR\b|\bSTAR\s*MARKET\b"), "Star Bazaar"),
      MapEntry(RegExp(r"\bRATNADEEP\b"), "Ratnadeep"),
      MapEntry(RegExp(r"\bJIOMART\b|\bJIO\s*MART\b"), "JioMart"),
      MapEntry(RegExp(r"\bRELIANCE\s*(SMART\s*BAZAAR|FRESH|SMART)\b"), "Reliance Smart Bazaar"),
      MapEntry(RegExp(r"\bMORE\s*SUPERMARKET\b|\bMORE\s*MEGASTORE\b"), "More Supermarket"),
      MapEntry(RegExp(r"\bSPENCER'?S\b"), "Spencer's"),
      MapEntry(RegExp(r"\bNATURE[’']?\s*BASKET\b"), "Nature's Basket"),
      MapEntry(RegExp(r"\bFRESH\s*TO\s*HOME\b|\bFRESHTOHOME\b"), "FreshToHome"),
      MapEntry(RegExp(r"\bLICIOUS\b"), "Licious"),
      // Only explicit Zomato markets
      MapEntry(RegExp(r"\bZOMATO\s*(MARKET|INSTANT)\b"), "Zomato Market"),
    ];

    for (final e in pairs) {
      if (e.key.hasMatch(u)) {
        return {
          'merchant': e.value,
          'category': 'Online Groceries',
          'confidence': 0.98,
          'tags': const ['quickCommerce', 'groceries'],
        };
      }
    }

    // Domain-based hint
    final dm = _merchantFromDomain(domain);
    if (dm != null) {
      return {
        'merchant': dm,
        'category': 'Online Groceries',
        'confidence': 0.93,
        'tags': const ['quickCommerce', 'groceries'],
      };
    }

    // Seed merchant already indicates QC?
    if (seedMerchant != null) {
      final sm = seedMerchant.toUpperCase();
      for (final e in pairs) {
        if (e.key.hasMatch(sm)) {
          return {
            'merchant': seedMerchant,
            'category': 'Online Groceries',
            'confidence': 0.95,
            'tags': const ['quickCommerce', 'groceries'],
          };
        }
      }
    }
    return null;
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
