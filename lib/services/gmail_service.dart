// lib/services/gmail_service.dart
import 'dart:convert';
import 'dart:math' as math;

import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:googleapis/gmail/v1.dart' as gmail;
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/expense_item.dart';
import '../models/income_item.dart';

// 🔗 LLM config + extractor (LLM-first)
import '../config/app_config.dart';
import './ai/tx_extractor.dart';
import './ingest/enrichment_service.dart';
import './categorization/category_rules.dart';
import './user_overrides.dart';
import './merchants/merchant_alias_service.dart';
import './ingest/cross_source_reconcile.dart';
import './recurring/recurring_engine.dart';

import './ingest_index_service.dart';
import './tx_key.dart';
import './ingest_state_service.dart';
import './ingest_job_queue.dart';
import './ingest/cross_source_reconcile.dart';   // merge
import './merchants/merchant_alias_service.dart'; // alias normalize
import './ingest_filters.dart' as filt;            // ✅ stronger filtering helpers
import './categorization/category_rules.dart';
import './recurring/recurring_engine.dart';
import './user_overrides.dart';

// Merge policy: OFF (for testing), ENRICH (recommended), SILENT (current behavior)
enum ReconcilePolicy { off, mergeEnrich, mergeSilent }

// ── Bank detection & tiering (major vs other) ────────────────────────────────

enum _BankTier { major, other, unknown }

class _DetectedBank {
  final String? code;     // e.g. 'HDFC'
  final String? display;  // e.g. 'HDFC Bank'
  final _BankTier tier;
  const _DetectedBank({this.code, this.display, this.tier = _BankTier.unknown});
}

class _BankProfile {
  final String code;                 // 'SBI'
  final String display;              // 'State Bank of India'
  final List<String> domains;        // email domains to match
  final List<String> headerHints;    // name hints in From/headers
  const _BankProfile({
    required this.code,
    required this.display,
    this.domains = const [],
    this.headerHints = const [],
  });
}


class GmailService {
  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool AUTO_POST_TXNS = true;      // create expenses/incomes immediately
  static const bool USE_SERVICE_WRITES = false; // write via Firestore set(merge)
  static const int DEFAULT_OVERLAP_HOURS = 24;
  static const int INITIAL_HISTORY_DAYS = 120;
  static const bool AUTO_RECAT_LAST_24H = true;
  static const ReconcilePolicy RECONCILE_POLICY = ReconcilePolicy.mergeEnrich;
  // Backfill behaviour:
  // - On first Gmail run, or if user comes back after a long gap,
  //   we aggressively backfill up to this many days.
  static const int MAX_BACKFILL_DAYS = 1000;

  // "Long gap" threshold: if last Gmail sync was more than this many
  // days ago, treat it like a fresh/backfill sync.
  static const int LONG_GAP_DAYS = 60;
  bool _looksLikeCardBillPayment(String text, {String? bank, String? last4}) {
    final u = text.toUpperCase();
    final payCue = RegExp(r'(CARD\s*PAYMENT|PAYMENT\s*RECEIVED|THANK YOU.*PAYING|BILL\s*PAYMENT)').hasMatch(u);
    final ccCue  = u.contains('CREDIT CARD') || u.contains('CC');
    final last4Hit = (last4 != null) && RegExp(r'\b' + RegExp.escape(last4) + r'\b').hasMatch(u);
    final bankHit  = (bank != null) && u.contains((bank).toUpperCase());
    return payCue && (last4Hit || bankHit || ccCue);
  }
  String _maskSensitive(String s) {
    var t = s;
    // mask long digit runs (cards/accounts), keep last4
    t = t.replaceAllMapped(
      RegExp(r'\b(\d{4})\d{4,10}(\d{4})\b'),
          (m) => '**** **** **** ${m.group(2)}',
    );
    // redact OTP tokens/one-time passwords
    t = t.replaceAll(RegExp(r'\b(OTP|ONE[-\s]?TIME\s*PASSWORD)\b[^\n]*', caseSensitive: false), '[REDACTED OTP]');
    return t;
  }

  // Major public + private sector banks we want strong primary logic for.
  static const List<_BankProfile> _MAJOR_BANKS = [
    // Public sector
    _BankProfile(
      code: 'SBI',
      display: 'State Bank of India',
      domains: ['sbi.co.in'],
      headerHints: ['state bank of india', 'sbi'],
    ),
    _BankProfile(
      code: 'PNB',
      display: 'Punjab National Bank',
      domains: ['pnb.co.in'],
      headerHints: ['punjab national bank', 'pnb'],
    ),
    _BankProfile(
      code: 'BOB',
      display: 'Bank of Baroda',
      domains: ['bankofbaroda.co.in'],
      headerHints: ['bank of baroda', 'bob'],
    ),
    _BankProfile(
      code: 'UNION',
      display: 'Union Bank of India',
      domains: ['unionbankofindia.co.in'],
      headerHints: ['union bank of india', 'union bank'],
    ),
    _BankProfile(
      code: 'BOI',
      display: 'Bank of India',
      domains: ['bankofindia.co.in'],
      headerHints: ['bank of india'],
    ),
    _BankProfile(
      code: 'CANARA',
      display: 'Canara Bank',
      domains: ['canarabank.com'],
      headerHints: ['canara bank'],
    ),
    _BankProfile(
      code: 'INDIAN',
      display: 'Indian Bank',
      domains: ['indianbank.in'],
      headerHints: ['indian bank'],
    ),
    _BankProfile(
      code: 'IOB',
      display: 'Indian Overseas Bank',
      domains: ['iob.in'],
      headerHints: ['indian overseas bank', 'iob'],
    ),
    _BankProfile(
      code: 'UCO',
      display: 'UCO Bank',
      domains: ['ucobank.com'],
      headerHints: ['uco bank'],
    ),
    _BankProfile(
      code: 'MAHARASHTRA',
      display: 'Bank of Maharashtra',
      domains: ['bankofmaharashtra.in', 'mahabank.co.in'],
      headerHints: ['bank of maharashtra'],
    ),
    _BankProfile(
      code: 'CBI',
      display: 'Central Bank of India',
      domains: ['centralbankofindia.co.in'],
      headerHints: ['central bank of india'],
    ),
    _BankProfile(
      code: 'PSB',
      display: 'Punjab & Sind Bank',
      domains: ['psbindia.com'],
      headerHints: ['punjab and sind bank', 'punjab & sind bank'],
    ),

    // Private sector
    _BankProfile(
      code: 'HDFC',
      display: 'HDFC Bank',
      domains: ['hdfcbank.com'],
      headerHints: ['hdfc bank', 'hdfc'],
    ),
    _BankProfile(
      code: 'ICICI',
      display: 'ICICI Bank',
      domains: ['icicibank.com'],
      headerHints: ['icici bank', 'icici'],
    ),
    _BankProfile(
      code: 'AXIS',
      display: 'Axis Bank',
      domains: ['axisbank.com'],
      headerHints: ['axis bank', 'axis'],
    ),
    _BankProfile(
      code: 'KOTAK',
      display: 'Kotak Mahindra Bank',
      domains: ['kotak.com'],
      headerHints: ['kotak mahindra bank', 'kotak'],
    ),
    _BankProfile(
      code: 'INDUSIND',
      display: 'IndusInd Bank',
      domains: ['indusind.com'],
      headerHints: ['indusind bank', 'indusind'],
    ),
    _BankProfile(
      code: 'YES',
      display: 'Yes Bank',
      domains: ['yesbank.in'],
      headerHints: ['yes bank'],
    ),
    _BankProfile(
      code: 'FEDERAL',
      display: 'Federal Bank',
      domains: ['federalbank.co.in'],
      headerHints: ['federal bank'],
    ),
    _BankProfile(
      code: 'IDFCFIRST',
      display: 'IDFC First Bank',
      domains: ['idfcfirstbank.com', 'idfcbank.com'],
      headerHints: ['idfc first bank', 'idfc'],
    ),
    _BankProfile(
      code: 'IDBI',
      display: 'IDBI Bank',
      domains: ['idbibank.com'],
      headerHints: ['idbi bank', 'idbi'],
    ),
  ];

  _DetectedBank _detectBank({
    required List<gmail.MessagePartHeader>? headers,
    required String body,
  }) {
    final domain = _fromDomain(headers);
    final normalizedDomain = domain?.toLowerCase();
    final fromHdr = _getHeader(headers, 'from') ?? '';
    final subject = _getHeader(headers, 'subject') ?? '';
    final all = (fromHdr + ' ' + subject + ' ' + body).toLowerCase();

    for (final b in _MAJOR_BANKS) {
      if (normalizedDomain != null &&
          b.domains.any((d) => normalizedDomain.endsWith(d.toLowerCase()))) {
        return _DetectedBank(code: b.code, display: b.display, tier: _BankTier.major);
      }
      if (b.headerHints.any((h) => all.contains(h.toLowerCase()))) {
        return _DetectedBank(code: b.code, display: b.display, tier: _BankTier.major);
      }
    }

    // Fallback: reuse existing header/body guessers and treat as "other"
    final guess = _guessBankFromHeaders(headers) ?? _guessIssuerBankFromBody(body);
    if (guess != null && guess.trim().isNotEmpty) {
      return _DetectedBank(code: guess.toUpperCase(), display: guess.toUpperCase(), tier: _BankTier.other);
    }

    return const _DetectedBank(tier: _BankTier.unknown);
  }

  // PATCH: strict txn gating utilities
  bool _hasCurrencyAmount(String s) => RegExp(
        r'(₹|inr|rs\.?)\s*[0-9][\d,]*(?:\.\d{1,2})?',
        caseSensitive: false,
      ).hasMatch(s);

  bool _hasDebitVerb(String s) => RegExp(
        r'\b(debited|amount\s*debited|spent|paid|payment|purchase|charged|withdrawn|withdrawal|pos|upi|imps|neft|rtgs|txn|transaction|autopay|mandate|emi)\b',
        caseSensitive: false,
      ).hasMatch(s);

  bool _hasCreditVerb(String s) => RegExp(
        r'\b(credited|amount\s*credited|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
        caseSensitive: false,
      ).hasMatch(s);

  bool _hasRefToken(String s) => RegExp(
        r'\b(utr|ref(?:erence)?|order|invoice|a/?c|acct|account|card|vpa|pos|txn)\b',
        caseSensitive: false,
      ).hasMatch(s);

  bool _passesTxnGate(String text, {String? domain, _DetectedBank? bank}) {
    final t = text;
    final hasCurrency = _hasCurrencyAmount(t);
    final hasDebitOrCreditVerb = _hasDebitVerb(t) || _hasCreditVerb(t);
    final hasRefOrCue = _hasRefToken(t) ||
        RegExp(
          r'(account\s*(no|number)|txn\s*id|transaction\s*info)',
          caseSensitive: false,
        ).hasMatch(t);

    // obvious promo/future cues
    final promo = filt.isLikelyPromo(t);
    final futureish = _looksFutureCredit(t);

    final isGatewayDomain = domain != null &&
        _EMAIL_WHITELIST.any((d) => domain.toLowerCase().endsWith(d));
    final isMajorBank = bank?.tier == _BankTier.major;

    if (!hasCurrency || !hasDebitOrCreditVerb) return false;
    if (futureish) return false;

    // For major banks and known gateways:
    // - allow slightly looser conditions, but still block pure promos.
    if (isMajorBank || isGatewayDomain) {
      if (promo && !hasRefOrCue) return false;
      // Currency + verb is enough, ref is a nice-to-have
      return true;
    }

    // For all other/unknown senders:
    // - require ref/txn/account cue and non-promo.
    if (!hasRefOrCue) return false;
    if (promo && !hasRefOrCue) return false;

    return true;
  }

  bool _tooSmallToTrust(String body, double amt) {
    if (amt >= 5) return false;
    final creditOK = RegExp(
      r'\b(refund|cashback|reversal|interest)\b',
      caseSensitive: false,
    ).hasMatch(body);
    return !creditOK;
  }

  // Stronger email domain whitelist for payment gateways / card networks / wallets.
  // NOTE: major bank domains are handled via _MAJOR_BANKS + _detectBank, not here.
  static const Set<String> _EMAIL_WHITELIST = {
    'bobfinancial.com',
    'amex.com',
    'mastercard.com',
    'visacards.com',
    'rupay.co.in',
    'razorpay.com',
    'billdesk.com',
    'cashfree.com',
    'paytm.com',
    'phonepe.com',
  };

  bool _looksPromotionalIncome(String s) {
    final rx = RegExp(
      r'(loan\s+up\s+to|pre[-\s]?approved|apply\s+now|kyc|complete\s+kyc|'
      r'offer|subscribe|webinar|workshop|newsletter|utm_|unsubscribe|http[s]?://)',
      caseSensitive: false,
    );
    final strongTxn = RegExp(
      r'\b(invoice|receipt|order|utr|ref(?:erence)?|payout|settlement|imps|neft|upi)\b',
      caseSensitive: false,
    ).hasMatch(s);
    return rx.hasMatch(s) && !strongTxn;
  }

  bool _looksFutureCredit(String s) => RegExp(
        r'\b(can|will|may)\s+be\s+credited\b',
        caseSensitive: false,
      ).hasMatch(s);

  bool _emailTxnGateForIncome(String text, {String? domain, _DetectedBank? bank}) {
    final hasCurrency = _hasCurrencyAmount(text);
    final strongCredit = RegExp(
      r'\b(has\s*been\s*credited|credited\s*(?:by|with)?|received\s*(?:from)?|payout|settlement)\b',
      caseSensitive: false,
    ).hasMatch(text);
    final hasRef = _hasRefToken(text);
    final promoOrFuture =
        _looksPromotionalIncome(text) || _looksFutureCredit(text);

    final isGatewayDomain = domain != null &&
        _EMAIL_WHITELIST.any((d) => domain.toLowerCase().endsWith(d));
    final isMajorBank = bank?.tier == _BankTier.major;

    if (!hasCurrency || !strongCredit) return false;
    if (promoOrFuture) return false;

    // For major banks or known gateways: currency + strong credit is enough.
    if (isMajorBank || isGatewayDomain) {
      return true;
    }

    // For others, require a reference/account/txn cue as well.
    return hasRef && !promoOrFuture;
  }




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
  // lib/services/gmail_service.dart  (inside class GmailService)
  static const bool WRITE_BILL_AS_EXPENSE = false; // ← turn OFF to avoid double-count

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
    return 'ing_${hex}';
  }

  // --- helpers added ----------------------------------------------------------

  // Extract UPI VPA (first one) limited to known PSP/bank handles
  String? _extractUpiVpa(String text) {
    const handles = [
      'ybl',
      'okaxis',
      'oksbi',
      'okhdfcbank',
      'okicici',
      'ibl',
      'upi',
      'paytm',
      'apl',
      'axisbank',
      'hdfcbank',
      'icici',
      'sbi',
      'idfcbank',
      'kotak',
    ];
    final re = RegExp(
      r'\b([a-zA-Z0-9.\-_]{2,})@(' + handles.join('|') + r')\b',
      caseSensitive: false,
    );
    return re.firstMatch(text)?.group(0);
  }

  String? _extractPaidToName(String text) {
    if (text.isEmpty) return null;

    String? sanitize(String? raw) {
      if (raw == null) return null;
      final cleaned = raw
          .replaceAll(RegExp(r"""["'`]+"""), ' ')
          .replaceAll(RegExp(r'[^A-Za-z0-9 .&/@-]'), ' ')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      if (cleaned.length < 3) return null;
      final upper = cleaned.toUpperCase();
      const skipPhrases = [
        'INFORM YOU THAT',
        'INFORM YOU',
        'INFORM THAT',
        'DEAR',
        'THANK YOU',
        'THANKS',
        'THIS IS TO INFORM',
        'WE INFORM YOU',
        'WE WOULD LIKE TO INFORM',
      ];
      for (final phrase in skipPhrases) {
        if (upper.startsWith(phrase)) return null;
      }

      const stopwords = {
        'INFORM',
        'YOU',
        'YOUR',
        'THAT',
        'ACCOUNT',
        'ACC',
        'A',
        'THE',
        'WE',
        'ARE',
        'IS',
        'TO',
        'FROM',
        'PAYMENT',
        'PAID',
        'THANK',
        'CUSTOMER',
        'CARD',
        'CREDIT',
        'DEBIT',
        'BANK',
        'REF',
        'REFERENCE',
        'TRANSACTION',
        'DETAILS',
        'INFO',
        'NOTICE',
        'BALANCE',
        'AMOUNT',
        'THIS',
        'MESSAGE',
      };
      final tokens = upper.split(RegExp(r'[^A-Z0-9]+')).where((e) => e.isNotEmpty).toList();
      if (tokens.isEmpty) return null;
      final nonStop = tokens.where((w) => !stopwords.contains(w)).length;
      if (nonStop == 0 || nonStop / tokens.length < 0.4) return null;
      if (upper.contains('ACCOUNT') || upper.contains('ACC.')) return null;
      return upper;
    }

    final candidates = <String>[];

    final byPattern = RegExp(
      r'\bby\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
      caseSensitive: false,
    );
    for (final m in byPattern.allMatches(text)) {
      final cleaned = sanitize(m.group(1));
      if (cleaned != null) {
        candidates.add(cleaned);
      }
    }

    final toPattern = RegExp(
      r'\b(?:paid|payment)?\s*to\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .&/@-]{2,40})',
      caseSensitive: false,
    );
    for (final m in toPattern.allMatches(text)) {
      final cleaned = sanitize(m.group(1));
      if (cleaned != null) {
        candidates.add(cleaned);
      }
    }

    final upiPattern = RegExp(
      r'UPI(?:/[A-Za-z0-9]+)?/[A-Za-z0-9.@_-]{2,}/([A-Za-z0-9 .&@-]{2,40})',
      caseSensitive: false,
    );
    for (final m in upiPattern.allMatches(text)) {
      final cleaned = sanitize(m.group(1));
      if (cleaned != null) {
        candidates.add(cleaned);
      }
    }

    return candidates.isNotEmpty ? candidates.first : null;
  }

  // Credit Card Bill extraction (Total Due, Min Due, Due Date, Statement period)
  _BillInfo? _extractCardBillInfo(String text) {
    final t = text.toUpperCase();
    if (!(t.contains('CREDIT CARD') || t.contains('CC'))) return null;

    // must see some bill/statement cue
    final hasCue = RegExp(
      r'(TOTAL\s*(AMT|AMOUNT)?\s*DUE|MIN(IM)?UM\s*(AMT|AMOUNT)?\s*DUE|DUE\s*DATE|BILL\s*DUE|STATEMENT)',
      caseSensitive: false,
    ).hasMatch(text);
    if (!hasCue) return null;

    double? _amtAfter(List<RegExp> rxs) {
      for (final rx in rxs) {
        final a = RegExp(
          rx.pattern + r''':?\s*(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)?\s*([0-9][\d,]*(?:\.\d{1,2})?)''',
          caseSensitive: false,
        ).firstMatch(text);
        if (a != null) {
          final v = double.tryParse((a.group(1) ?? '').replaceAll(',', ''));
          if (v != null) return v;
        }
      }
      return null;
    }

    DateTime? _dateAfter(List<RegExp> rxs) {
      final rxDate = RegExp(
        r'(\b\d{1,2}[-/ ]\d{1,2}[-/ ]\d{2,4}\b)|(\b\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4}\b)',
        caseSensitive: false,
      );
      for (final rx in rxs) {
        final m = rx.firstMatch(text);
        if (m != null) {
          final after = text.substring(m.end);
          final d = rxDate.firstMatch(after);
          if (d != null) {
            final s = d.group(0)!;
            final dt = _parseLooseDate(s);
            if (dt != null) return dt;
          }
        }
      }
      return null;
    }

    final total = _amtAfter([RegExp(r'\b(TOTAL\s*(AMT|AMOUNT)?\s*DUE)\b', caseSensitive: false)]);
    final minDue = _amtAfter([RegExp(r'\b(MIN(IM)?UM\s*(AMT|AMOUNT)?\s*DUE)\b', caseSensitive: false)]);
    final dueDate = _dateAfter([
      RegExp(r'\b(DUE\s*DATE)\b', caseSensitive: false),
      RegExp(r'\b(BILL\s*DUE)\b', caseSensitive: false),
    ]);

    DateTime? stStart;
    DateTime? stEnd;
    final period = RegExp(
      r'(STATEMENT\s*(PERIOD)?|BILL\s*CYCLE)[^0-9]*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{2,4})\s*(TO|-)\s*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{2,4})',
      caseSensitive: false,
    ).firstMatch(text);
    if (period != null) {
      stStart = _parseLooseDate(period.group(3)!);
      stEnd   = _parseLooseDate(period.group(5)!);
    }

    if (total == null && minDue == null && dueDate == null) return null;
    return _BillInfo(totalDue: total, minDue: minDue, dueDate: dueDate, statementStart: stStart, statementEnd: stEnd);
  }

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

  // Short preview (80 chars)
  String _preview(String raw) {
    var p = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (p.length > 80) p = '${p.substring(0, 80)}…';
    return p;
  }

  // Extract sender name for UPI P2A alerts, e.g. "UPI/P2A/.../SHREYA AG/HDFC BANK"
  String? _extractUpiSenderName(String text) {
    final rx = RegExp(
      r'\bUPI\/P2A\/[^\/\s]{3,}\/([A-Z][A-Z0-9 \.\-]{2,})(?:\/|\b)',
      caseSensitive: false,
    );
    final m = rx.firstMatch(text.toUpperCase());
    if (m != null) {
      final raw = (m.group(1) ?? '').trim();
      if (raw.isNotEmpty && !RegExp(r'(HDFC|ICICI|SBI|AXIS|KOTAK|YES|IDFC|BANK)', caseSensitive: false).hasMatch(raw)) {
        return raw;
      }
      return raw;
    }
    return null;
  }

  // ---------------------------------------------------------------------------

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    _currentUser = null;
  }
  Future<void> _maybeAttachToCardBillPayment({
    required String userId,
    required double amount,
    required DateTime paidAt,
    required String? bank,
    required String? last4,
    required DocumentReference txRef,
    required Map<String, dynamic> sourceMeta,
  }) async {
    String? bankLocal = bank;
    String? last4Local = last4;

    // Try to infer last4 from raw preview if neither bank nor last4 was detected
    if (bankLocal == null && last4Local == null) {
      final raw = (sourceMeta['rawPreview'] as String?) ?? '';
      final guess4 = _extractCardLast4(raw);
      if (guess4 != null) last4Local = guess4;
    }
    if (bankLocal == null && last4Local == null) return;

    // Build query: prefer last4, else fallback to issuerBank
    Query billQuery = FirebaseFirestore.instance
        .collection('users').doc(userId)
        .collection('bill_reminders')
        .where('kind', isEqualTo: 'credit_card_bill');

    if (last4Local != null) {
      billQuery = billQuery.where('cardLast4', isEqualTo: last4Local);
    } else if (bankLocal != null) {
      billQuery = billQuery.where('issuerBank', isEqualTo: bankLocal);
    } else {
      return;
    }

    final snap = await billQuery.orderBy('dueDate', descending: true).limit(1).get();
    if (snap.docs.isEmpty) return;

    final d = snap.docs.first;
    final data = d.data() as Map<String, dynamic>;
    final num totalDueN = (data['totalDue'] ?? data['minDue'] ?? 0) as num;
    final num alreadyN  = (data['amountPaid'] ?? 0) as num;

    final double totalDue = totalDueN.toDouble();
    final double nowPaid  = alreadyN.toDouble() + amount;
    final String status   = (totalDue > 0 && nowPaid + 1e-6 >= totalDue) ? 'paid' : 'partial';

    await d.reference.set({
      'amountPaid': nowPaid,
      'status': status,
      'linkedPaymentIds': FieldValue.arrayUnion([txRef.id]),
      'updatedAt': Timestamp.now(),
    }, SetOptions(merge: true));
  }




  // ── Legacy compat: keep old entry point alive ──────────────────────────────
  Future<void> fetchAndStoreTransactionsFromGmail(
      String userId, {
        int newerThanDays = INITIAL_HISTORY_DAYS,
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

  // ── New entry points ───────────────────────────────────────────────────────

  Future<void> initialBackfill({
    required String userId,
    int newerThanDays = INITIAL_HISTORY_DAYS,
    int pageSize = 500,
  }) async {
    // Ensure ingest state exists and load it (gives us lastGmailAt if any)
    final st = await IngestStateService.instance.getOrCreate(userId);
    final now = DateTime.now();

    int daysBack;

    if (st.lastGmailAt == null) {
      // First time we are pulling Gmail for this user → heavy backfill
      daysBack = MAX_BACKFILL_DAYS;
    } else {
      final gapDays = now.difference(st.lastGmailAt!).inDays;
      // If user has been away for a long time, treat like a "fresh" backfill
      daysBack = gapDays > LONG_GAP_DAYS
          ? MAX_BACKFILL_DAYS
          : newerThanDays;
    }

    // In TEST_MODE we still cap by TEST_BACKFILL_DAYS as before
    final since = TEST_MODE
        ? now.subtract(const Duration(days: TEST_BACKFILL_DAYS))
        : now.subtract(
            Duration(days: daysBack.clamp(1, MAX_BACKFILL_DAYS)),
          );

    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);

    if (AUTO_RECAT_LAST_24H) {
      await recategorizeLastWindow(userId: userId, windowHours: 24, batch: 50);
    }
  }

  Future<void> syncDelta({
    required String userId,
    int overlapHours = DEFAULT_OVERLAP_HOURS,
    int pageSize = 300,
    int fallbackDaysIfNoWatermark = INITIAL_HISTORY_DAYS,
  }) async {
    final st = await IngestStateService.instance.get(userId);
    final now = DateTime.now();

    DateTime since;
    final last = st.lastGmailAt;

    if (last == null) {
      // No watermark yet → treat like a backfill, but capped.
      final daysBack = fallbackDaysIfNoWatermark.clamp(1, MAX_BACKFILL_DAYS);
      since = now.subtract(Duration(days: daysBack));
    } else {
      final gapDays = now.difference(last).inDays;
      if (gapDays > LONG_GAP_DAYS) {
        // User came back after a long time (e.g. > 2 months) → widen window aggressively.
        since = now.subtract(Duration(days: MAX_BACKFILL_DAYS));
      } else {
        // Normal delta sync with overlap
        since = last.subtract(Duration(hours: overlapHours));
      }
    }

    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);

    if (AUTO_RECAT_LAST_24H) {
      await recategorizeLastWindow(userId: userId, windowHours: 24, batch: 50);
    }
  }

  // ── Main fetch + stage ─────────────────────────────────────────────────────
  Future<void> _fetchAndStage({
    required String userId,
    required DateTime since,
    int pageSize = 300,
  }) async {
    _currentUser = await _googleSignIn.signInSilently();
    _currentUser ??= await _googleSignIn.signIn();
    if (_currentUser == null) throw Exception('Google Sign-In failed');

    final headers = await _currentUser!.authHeaders;
    final gmailApi = gmail.GmailApi(_GoogleAuthClient(headers));

    final newerDays = _daysBetween(DateTime.now(), since).clamp(0, 36500);
    final baseQ =
        '(bank OR card OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR payment OR UPI OR refund OR salary OR invoice OR receipt OR statement OR bill) '
        'newer_than:${newerDays}d -in:spam -in:trash -category:promotions';



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

      for (var i = 0; i < msgs.length; i += PAGE_POOL) {
        final slice = msgs.sublist(i, (i + PAGE_POOL).clamp(0, msgs.length));
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

            final touched = await _handleMessage(userId: userId, msg: msg);
            if (touched != null &&
                (newestTouched == null || touched.isAfter(newestTouched!))) {
              newestTouched = touched;
            }
          } catch (e) {
            _log('message error: $e');
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
    final headers = msg.payload?.headers;
    final subject = _getHeader(headers, 'subject') ?? '';
    final fromHdr = _getHeader(headers, 'from') ?? '';
    final listId = _getHeader(headers, 'list-id') ?? '';
    final bodyText = _extractPlainText(msg.payload) ?? (msg.snippet ?? '');
    final combined = (subject + '\n' + bodyText).trim();

    if (combined.isEmpty) return null;

    // Detect bank/tier once and reuse everywhere.
    final emailDomain = _fromDomain(headers);
    final detectedBank = _detectBank(headers: headers, body: combined);

    // PATCH: strict gate before any heavy work (but allow card-bill path later)
    final looksTxn = _passesTxnGate(
      combined,
      domain: emailDomain,
      bank: detectedBank,
    );
    final passesIncomeGate = _emailTxnGateForIncome(
      combined,
      domain: emailDomain,
      bank: detectedBank,
    );

    // ── Early skips & special routing (safe) ─────────────────────────────────
    final direction = _inferDirection(combined); // 'debit'|'credit'|null
    final amountFx = _extractFx(combined);
    final amountInr = amountFx == null
        ? (_extractTxnAmount(combined, direction: direction) ?? _extractAnyInr(combined))
        : null;
    final amount = amountInr ?? amountFx?['amount'] as double?;
    final postBal = _extractPostTxnBalance(combined);
    final parsedTxnSignals = direction != null && (amount != null && amount > 0);

    if (amountInr != null || postBal != null) {
      _log('parsed amountInr=${amountInr ?? -1} postBalance=${postBal ?? -1} dir=${direction ?? '-'} msg=${msg.id ?? '-'}');
    }

// Drop newsletters/promos ONLY if they do NOT look like a transaction.
    if (filt.isLikelyNewsletter(listId, fromHdr) &&
        !(looksTxn || passesIncomeGate)) {
      if (_DEBUG) _log('drop: newsletter without txn signals');
      return null;
    }
    if (filt.isLikelyPromo(combined) && !(looksTxn || passesIncomeGate)) {
      if (_DEBUG) _log('drop: promo without txn signals');
      return null;
    }

// Balance alerts often include legit credits ("credited ... Avl bal ...").
// So ONLY drop balance alerts when there is NO clear txn signal.
    if (filt.isLikelyBalanceAlert(combined) &&
        !(looksTxn || passesIncomeGate)) {
      if (_DEBUG) _log('drop: balance alert without txn signals');
      return null;
    }

// Card bill logic: allow card-bill notices; drop other statements/bills.
    final cardBillCue = filt.isLikelyCardBillNotice(combined);
    if (!cardBillCue &&
        filt.isStatementOrBillNotice(combined) &&
        !(looksTxn || parsedTxnSignals)) {
      if (_DEBUG) _log('drop: statement/bill without txn signals');
      return null;
    }


    // Extract common signals
    final msgDate = DateTime.fromMillisecondsSinceEpoch(
      int.tryParse(msg.internalDate ?? '0') ?? DateTime.now().millisecondsSinceEpoch,
    );
    final bank = detectedBank.code ??
        _guessBankFromHeaders(headers) ??
        _guessIssuerBankFromBody(combined);
    final hasCardContext = _hasStrongCardCue(combined);
    String? cardLast4 = hasCardContext ? _extractCardLast4(combined) : null;
    final accountLast4 = _extractAccountLast4(combined);
    final upiVpa = _extractUpiVpa(combined);
    var instrument = _inferInstrument(combined);
    final network = _inferCardNetwork(combined);
    final isIntl = _looksInternational(combined);
    final fees = _extractFees(combined);
    final upiSenderRaw = _extractUpiSenderName(combined);
    final paidTo = _extractPaidToName(combined) ?? upiSenderRaw;
    final upiSender = upiSenderRaw;

    final isEmiAutopay = RegExp(r'\b(EMI|AUTOPAY|AUTO[- ]?DEBIT|NACH|E-?MANDATE|MANDATE)\b',
            caseSensitive: false)
        .hasMatch(combined);

    if (accountLast4 != null && (!hasCardContext || isEmiAutopay)) {
      instrument = 'Bank Account';
      cardLast4 = null;
    }

    // Card bill path FIRST
    final bill = _extractCardBillInfo(combined);
    if (bill != null) {
      final total = bill.totalDue ?? bill.minDue ?? amount ?? 0.0;
      if (total <= 0) return null;

      final cycleDate = bill.statementEnd ?? bill.dueDate ?? msgDate; // prefer cycle anchors
      final billId = _billDocId(bank: bank, last4: cardLast4, msgDate: cycleDate);

      final billRef = FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('bill_reminders').doc(billId);

      // upsert bill reminder
      await billRef.set({
        'kind': 'credit_card_bill',
        'issuerBank': bank,
        'cardLast4': cardLast4,
        'statementStart': bill.statementStart != null ? Timestamp.fromDate(bill.statementStart!) : null,
        'statementEnd':   bill.statementEnd   != null ? Timestamp.fromDate(bill.statementEnd!)   : null,
        'dueDate':        bill.dueDate        != null ? Timestamp.fromDate(bill.dueDate!)        : null,
        'totalDue': bill.totalDue,
        'minDue': bill.minDue,
        'status': _initialBillStatus(bill.dueDate),
        'amountPaid': FieldValue.increment(0), // keep numeric type
        'linkedPaymentIds': FieldValue.arrayUnion([]),
        'updatedAt': Timestamp.now(),
      }, SetOptions(merge: true));

      // store raw/email provenance
      await billRef.set({
        'sourceRecord': {
          'gmail': {
            'gmailId': msg.id,
            'threadId': msg.threadId,
            'internalDateMs': int.tryParse(msg.internalDate ?? '0'),
            'emailDomain': emailDomain,
            'rawPreview': _preview(combined),
            'when': Timestamp.fromDate(DateTime.now()),
          }
        },
        'merchantKey': (bank ?? 'CREDIT CARD').toUpperCase(),
      }, SetOptions(merge: true));

      // Optional: legacy expense write (hidden from spend) to keep UI working
      if (WRITE_BILL_AS_EXPENSE) {
        final key = buildTxKey(
          bank: bank, amount: total, time: msgDate, type: 'debit', last4: cardLast4,
        );
        final claimed = await _index.claim(userId, key, source: 'gmail').catchError((_) => false);
        if (claimed == true) {
          final expRef = FirebaseFirestore.instance
              .collection('users').doc(userId)
              .collection('expenses').doc(_docIdFromKey(key));
          await expRef.set({
            'type': 'Credit Card Bill',
            'amount': total,
            'note': _cleanNoteSimple(combined),
            'date': Timestamp.fromDate(msgDate),
            'payerId': userId,
            'cardLast4': cardLast4,
            'cardType': 'Credit Card',
            'issuerBank': bank,
            'instrument': 'Credit Card',
            'instrumentNetwork': network,
            'counterparty': (bank ?? 'CREDIT CARD').toUpperCase(),
            'counterpartyType': 'CARD_BILL',
            'isBill': true,
            'excludedFromSpending': true, // ← crucial
            'tags': ['credit_card_bill','bill'],
            'txKey': key,
            'ingestSources': FieldValue.arrayUnion(['gmail']),
            'sourceRecord': {
              'type': 'gmail',
              'gmailId': msg.id,
              'rawPreview': _preview(combined),
            },
          }, SetOptions(merge: true));
        }
      }

      _log('WRITE/UPSERT CC BillReminder total=$total bank=${bank ?? "-"} last4=${cardLast4 ?? "-"}');
      return msgDate;
    }


    // Otherwise, proceed with normal debit/credit
    if (direction == null) return null;
    if (amount == null || amount <= 0) return null;
    if (direction == 'credit') {
      if (!passesIncomeGate) {
        if (_DEBUG) _log('drop: gmail income gate failed');
        return null;
      }
      if (_tooSmallToTrust(combined, amount)) {
        if (_DEBUG) _log('drop: tiny income $amount');
        return null;
      }
    } else if (_tooSmallToTrust(combined, amount)) {
      if (_DEBUG) _log('drop: tiny amount $amount');
      return null;
    }

    // Merchant extraction & normalization (initial)
    // ===== NEW: Enrichment via EnrichmentService (LLM Primary) =====
    final preview = _preview(_maskSensitive(combined));
    final hintParts = <String>[
      'HINTS: dir=$direction',
      if (isEmiAutopay) 'cues=emi,autopay',
      if (instrument != null && instrument!.isNotEmpty)
        'instrument=${instrument!.toLowerCase().replaceAll(' ', '_')}',
      if (upiVpa != null && upiVpa.trim().isNotEmpty) 'upi=${upiVpa!.trim()}',
    ];
    
    final enriched = await EnrichmentService.instance.enrichTransaction(
      userId: userId,
      rawText: _maskSensitive(combined),
      amount: amount,
      date: msgDate,
      hints: hintParts,
    );

    var merchantNorm = enriched.merchantName;
    var merchantKey = merchantNorm.toUpperCase();
    final finalCategory = enriched.category;
    final finalSubcategory = enriched.subcategory;
    final finalConfidence = enriched.confidence;
    final categorySource = enriched.source;
    final labelSet = enriched.tags.toSet();
    final emiLocked = isEmiAutopay; // Keep this flag for later logic

    // txKey + claim for idempotency
    final key = buildTxKey(
      bank: bank,
      amount: amount,
      time: msgDate,
      type: direction,
      last4: cardLast4,
    );
    final claimed = await _index.claim(userId, key, source: 'gmail').catchError((_) => false);
    if (claimed != true) return null;

    // Cross-source merge (avoid duplicate even with tiny FX rounding)
    final sourceMeta = {
      'type': 'gmail',
      'gmailId': msg.id,
      'threadId': msg.threadId,
      'internalDateMs': int.tryParse(msg.internalDate ?? '0'),
      'raw': _maskSensitive(combined),
      'rawPreview': preview,
      'emailDomain': emailDomain,
      'when': Timestamp.fromDate(DateTime.now()),
      'txKey': key,
      if (merchantNorm.isNotEmpty) 'merchant': merchantNorm,
      if (bank != null) 'issuerBank': bank,
      if (upiVpa != null) 'upiVpa': upiVpa,
      if (network != null) 'network': network,
      if (cardLast4 != null) 'last4': cardLast4,
      if (accountLast4 != null) 'accountLast4': accountLast4,
      if (amountFx != null) 'fxOriginal': amountFx,
      if (fees.isNotEmpty) 'feesDetected': fees,
      'instrument': instrument,
      if (postBal != null) 'postBalanceInr': postBal,
    };

    String? existingDocId;
    if (RECONCILE_POLICY != ReconcilePolicy.off) {
      existingDocId = await CrossSourceReconcile.maybeMerge(
        userId: userId,
        direction: direction,
        amount: amount,
        timestamp: msgDate,
        cardLast4: cardLast4,
        merchantKey: merchantKey,
        txKey: key,
        upiVpa: upiVpa,
        issuerBank: bank,
        instrument: instrument,
        network: network,
        amountTolerancePct: (amountFx != null || isIntl) ? 2.0 : 0.5,
        newSourceMeta: sourceMeta,
      );
    }

    if (existingDocId != null) {
      if (RECONCILE_POLICY == ReconcilePolicy.mergeEnrich) {
        final col = (direction == 'debit') ? 'expenses' : 'incomes';
        final ref = FirebaseFirestore.instance
            .collection('users').doc(userId)
            .collection(col).doc(existingDocId);

        await ref.set({
          // mark that both SMS and Gmail contributed
          'ingestSources': FieldValue.arrayUnion(['gmail']),

          // add/refresh a lightweight gmail record
          'sourceRecord.gmail': {
            'gmailId': msg.id,
            'threadId': msg.threadId,
            'internalDateMs': int.tryParse(msg.internalDate ?? '0'),
            'rawPreview': preview,
            'emailDomain': emailDomain,
            'txKey': key,
            'when': Timestamp.fromDate(DateTime.now()),
            if (postBal != null) 'postBalanceInr': postBal,
          },

          // optional breadcrumbs
          'mergeHints': {
            'gmailMatched': true,
            'gmailTxKey': key,
          },
        }, SetOptions(merge: true));
      }

      _log('merge(${direction}) -> ${existingDocId} [policy: $RECONCILE_POLICY]');
      return msgDate;
    }


    var note = _cleanNoteSimple(combined);
    final currency = (amountFx?['currency'] as String?) ?? 'INR';
    final isIntlResolved = isIntl || (amountFx != null && currency.toUpperCase() != 'INR');
    String merchantNormPrime = merchantNorm;
    if (merchantNormPrime.isEmpty && paidTo != null && paidTo.trim().isNotEmpty) {
      merchantNormPrime = paidTo.trim().toUpperCase();
    }
    if (merchantNormPrime.isNotEmpty) {
      merchantKey = merchantNormPrime.toUpperCase();
    }
    merchantNorm = merchantNormPrime;

    if (emiLocked && direction == 'debit') {
      final emiDigits = accountLast4 ?? cardLast4;
      final prefix = 'Paid towards your EMI' +
          (emiDigits != null ? ' ****$emiDigits' : '');
      note = prefix + (note.isNotEmpty ? '\n$note' : '');
    }

    final counterparty = _deriveCounterparty(
      merchantNorm: merchantNormPrime,
      paidTo: paidTo,
      upiVpa: upiVpa,
      last4: cardLast4,
      bank: bank,
      domain: emailDomain,
      rawText: combined,
      direction: direction,
      isEmiAutopay: emiLocked,
    );
    final cptyType = _deriveCounterpartyType(
      merchantNorm: merchantNormPrime,
      upiVpa: upiVpa,
      instrument: instrument,
      direction: direction,
    );
    final extraTagList = _extraTagsFromText(combined);
    if (emiLocked) {
      if (!extraTagList.contains('loan_emi')) extraTagList.add('loan_emi');
      if (!extraTagList.contains('autopay')) extraTagList.add('autopay');
    }
    final tags = _buildTags(
      instrument: instrument,
      isIntl: isIntlResolved,
      hasFees: fees.isNotEmpty,
      extra: extraTagList,
    );

    if (_DEBUG) {
      _log('final txn dir=$direction instrument=${instrument ?? '-'} cardLast4=${cardLast4 ?? '-'} '
          'accountLast4=${accountLast4 ?? '-'} category=$finalCategory ($categorySource) '
          'counterparty=$counterparty amount=$amount');
    }

    if (direction == 'debit') {
      final expRef = FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('expenses').doc(_docIdFromKey(key));

      final e = ExpenseItem(
        id: expRef.id,
        type: 'Email Debit',
        amount: amount,
        note: note,
        date: msgDate,
        payerId: userId,
        cardLast4: cardLast4,
        cardType: _isCard(instrument) ? 'Credit Card' : null,
        issuerBank: bank,
        instrument: instrument,
        instrumentNetwork: network,
        upiVpa: upiVpa,
        counterparty: counterparty,           // ✅ "Paid to OPENAI"
        counterpartyType: cptyType,
        isInternational: isIntlResolved,
        fx: amountFx,
        fees: fees.isNotEmpty ? fees : null,
        tags: tags,
      );

      await expRef.set(e.toJson(), SetOptions(merge: true));
      await expRef.set({'source': 'Email'}, SetOptions(merge: true));
      final labelsForDoc = labelSet.toList();
      final combinedTags = <String>{};
      combinedTags.addAll(e.tags ?? const []);
      combinedTags.addAll(labelSet);
      await expRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchantNorm.isNotEmpty) 'merchant': merchantNorm,
        'txKey': key,
        'category': finalCategory,
        'subcategory': finalSubcategory,
        'categoryConfidence': finalConfidence,
        'categorySource': categorySource,
        'tags': combinedTags.toList(),
        'labels': labelsForDoc,
      }, SetOptions(merge: true));

      await expRef.set({
        'ingestSources': FieldValue.arrayUnion(['gmail']),
      }, SetOptions(merge: true));

      try {
        await RecurringEngine.maybeAttachToSubscription(userId, expRef.id);
        await RecurringEngine.maybeAttachToLoan(userId, expRef.id);
        await RecurringEngine.markPaidIfInWindow(userId, expRef.id);
      } catch (_) {}

      try {
        await IngestJobQueue.enqueue(
          userId: userId,
          txKey: key,
          rawText: combined,
          amount: amount,
          currency: currency,
          timestamp: msgDate,
          source: 'email',
          direction: 'debit',
          docId: expRef.id,
          docCollection: 'expenses',
          docPath: 'users/$userId/expenses/${expRef.id}',
          enabled: true,
        );
      } catch (_) {}
      if (_looksLikeCardBillPayment(combined, bank: bank, last4: cardLast4)) {
        await _maybeAttachToCardBillPayment(
          userId: userId,
          amount: amount,
          paidAt: msgDate,
          bank: bank,
          last4: cardLast4,
          txRef: expRef,
          sourceMeta: sourceMeta,
        );
      }


    } else {
      final incRef = FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('incomes').doc(_docIdFromKey(key));

      final i = IncomeItem(
        id: incRef.id,
        type: 'Email Credit',
        amount: amount,
        note: note,
        date: msgDate,
        source: 'Email',
        issuerBank: bank,
        instrument: instrument,
        instrumentNetwork: network,
        upiVpa: upiVpa,
        counterparty: counterparty,      // "Received from"
        counterpartyType: cptyType,
        isInternational: isIntlResolved,
        fx: amountFx,
        fees: fees.isNotEmpty ? fees : null,
        tags: tags,
      );

      await incRef.set(i.toJson(), SetOptions(merge: true));
      final labelsForDoc = labelSet.toList();
      final combinedTags = <String>{};
      combinedTags.addAll(i.tags ?? const []);
      combinedTags.addAll(labelSet);
      await incRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchantNorm.isNotEmpty) 'merchant': merchantNorm,
        'txKey': key,
        'category': finalCategory,
        'subcategory': finalSubcategory,
        'categoryConfidence': finalConfidence,
        'categorySource': categorySource,
        'tags': combinedTags.toList(),
        'labels': labelsForDoc,
      }, SetOptions(merge: true));

      await incRef.set({
        'ingestSources': FieldValue.arrayUnion(['gmail']),
      }, SetOptions(merge: true));

      try {
        await IngestJobQueue.enqueue(
          userId: userId,
          txKey: key,
          rawText: combined,
          amount: amount,
          currency: currency,
          timestamp: msgDate,
          source: 'email',
          direction: 'credit',
          docId: incRef.id,
          docCollection: 'incomes',
          docPath: 'users/$userId/incomes/${incRef.id}',
          enabled: true,
        );
      } catch (_) {}
    }

    _log('WRITE email type=$direction amt=$amount key=$key domain=${emailDomain ?? "-"}');
    return msgDate;
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
        final backoffMs = ((math.pow(2, attempt) as num).toInt() * 300) + jitter;
        await Future.delayed(Duration(milliseconds: backoffMs));

      }
    }
  }

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
        .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), ' ')
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
    if (has('axis')) return 'AXIS';
    if (has('icici')) return 'ICICI';
    if (has('sbi')) return 'SBI';
    if (has('kotak')) return 'KOTAK';
    if (has('yesbank') || has('yes bank')) return 'YES';
    if (has('federal')) return 'FEDERAL';
    if (has('idfc')) return 'IDFC';
    if (has('bankofbaroda') || has('bob')) return 'BOB';
    return null;
  }

  String? _fromDomain(List<gmail.MessagePartHeader>? headers) {
    if (headers == null) return null;
    final from = _getHeader(headers, 'from') ?? '';
    final m = RegExp(r'[<\s]([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})[>\s]?',
        caseSensitive: false)
        .firstMatch(from);
    if (m != null) return (m.group(2) ?? '').toLowerCase();
    final reply =
        _getHeader(headers, 'reply-to') ?? _getHeader(headers, 'return-path') ?? '';
    final m2 = RegExp(r'@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', caseSensitive: false)
        .firstMatch(reply);
    return m2?.group(1)?.toLowerCase();
  }

  String? _extractAccountLast4(String text) {
    final patterns = <RegExp>[
      RegExp(
        r'(?:A\s*/?C(?:COUNT)?|ACCOUNT|ACC(?:OUNT)?)\s*(?:NO\.?|NUMBER|NUM|#|:)?\s*([Xx*\d\s]{4,})',
        caseSensitive: false,
      ),
      RegExp(
        r'\bAccount\s*(?:ending|ending\s*in|ending\s*with)?\s*[:=]?\s*([Xx*\d\s]{4,})',
        caseSensitive: false,
      ),
    ];

    for (final pattern in patterns) {
      for (final match in pattern.allMatches(text)) {
        final raw = match.group(1);
        if (raw == null) continue;
        final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          return digits.substring(digits.length - 4);
        }
      }
    }
    return null;
  }

  bool _hasStrongCardCue(String text) {
    final t = text.toUpperCase();
    return RegExp(
      r'(CREDIT\s+CARD|DEBIT\s+CARD|CARD\s*ENDING|CARD\s*NUMBER|CARD\s*NO\b|CARD\s*PAYMENT|CARD\s*PURCHASE|CARD\s*SWIPE|VISA|MASTERCARD|RUPAY|AMEX|DINERS|ATM|POS)',
      caseSensitive: false,
    ).hasMatch(t);
  }

  String? _extractCardLast4(String text) {
    if (!_hasStrongCardCue(text)) return null;
    final re = RegExp(
      r'(?:ending(?:\s*in)?|xx+|x{2,}|XXXX|XX|last\s*digits|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})',
      caseSensitive: false,
    );
    return re.firstMatch(text)?.group(1);
  }

  double? _extractTxnAmount(String text, {String? direction}) {
    if (text.isEmpty) return null;
    final amountPatterns = <RegExp>[
      RegExp(r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\.\d{1,2})?)',
          caseSensitive: false),
      RegExp(r'\bamount\s+of\s+([0-9][\d,]*(?:\.\d{1,2})?)', caseSensitive: false),
    ];
    final balanceCue = RegExp(
      r'(A/?c\.?\s*Bal|Ac\s*Bal|AVL\s*Bal|Avail(?:able)?\s*Bal(?:ance)?|Closing\s*Balance|Current\s*Balance|'
      r'Ledger\s*Balance|Passbook\s*Balance|\bBal(?:ance)?\b)',
      caseSensitive: false,
    );
    final creditCues = RegExp(
      r'(has\s*been\s*credited|credited\s*(?:by|with)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal)',
      caseSensitive: false,
    );
    final debitCues = RegExp(
      r'(has\s*been\s*debited|debited|spent|paid|payment|withdrawn|withdrawal|pos|upi|imps|neft|rtgs|purchase|txn|transaction)',
      caseSensitive: false,
    );

    Iterable<RegExpMatch> cueMatches;
    final dir = direction?.toLowerCase();
    if (dir == 'credit') {
      cueMatches = creditCues.allMatches(text);
    } else if (dir == 'debit') {
      cueMatches = debitCues.allMatches(text);
    } else {
      final merged = <RegExpMatch>[
        ...creditCues.allMatches(text),
        ...debitCues.allMatches(text),
      ]..sort((a, b) => a.start.compareTo(b.start));
      cueMatches = merged;
    }

    double? firstNonBalanceAfter(int start, int window) {
      final end = math.min(text.length, start + window);
      if (start >= end) return null;
      final windowText = text.substring(start, end);
      double? best;
      var bestIndex = 1 << 30;
      for (final rx in amountPatterns) {
        for (final m in rx.allMatches(windowText)) {
          final absoluteStart = start + m.start;
          final lookbackStart = math.max(0, absoluteStart - 40);
          final lookback = text.substring(lookbackStart, absoluteStart);
          if (balanceCue.hasMatch(lookback)) continue;
          final numStr = (m.group(1) ?? '').replaceAll(',', '');
          final value = double.tryParse(numStr);
          if (value != null && value > 0 && absoluteStart < bestIndex) {
            bestIndex = absoluteStart;
            best = value;
          }
        }
      }
      return best;
    }

    for (final cue in cueMatches) {
      final v = firstNonBalanceAfter(cue.end, 80);
      if (v != null) return v;
    }

    double? fallback;
    var fallbackIdx = 1 << 30;
    for (final rx in amountPatterns) {
      for (final m in rx.allMatches(text)) {
        final absoluteStart = m.start;
        final lookbackStart = math.max(0, absoluteStart - 40);
        final lookback = text.substring(lookbackStart, absoluteStart);
        if (balanceCue.hasMatch(lookback)) continue;
        final numStr = (m.group(1) ?? '').replaceAll(',', '');
        final value = double.tryParse(numStr);
        if (value != null && value > 0 && absoluteStart < fallbackIdx) {
          fallbackIdx = absoluteStart;
          fallback = value;
        }
      }
    }
    return fallback;
  }

  double? _extractPostTxnBalance(String text) {
    if (text.isEmpty) return null;
    final patterns = <RegExp>[
      RegExp(
        r'(?:A/?c\.?\s*Bal(?:\.|\s*is)?|Ac\s*Bal|AVL\s*Bal|Avail(?:able)?\s*Bal(?:ance)?|Closing\s*Balance)\s*(?:is\s*)?(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)?\s*([0-9][\d,]*(?:\.\d{1,2})?)',
        caseSensitive: false,
      ),
      RegExp(
        r'\b(?:balance|bal)\s*(?:is|:)?\s*(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)?\s*([0-9][\d,]*(?:\.\d{1,2})?)',
        caseSensitive: false,
      ),
    ];
    for (final rx in patterns) {
      final match = rx.firstMatch(text);
      if (match != null) {
        final numStr = (match.group(1) ?? '').replaceAll(',', '');
        final value = double.tryParse(numStr);
        if (value != null && value > 0) {
          return value;
        }
      }
    }
    return null;
  }

  double? _extractAnyInr(String text) {
    final rxs = <RegExp>[
      RegExp(r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\.\d{1,2})?)',
          caseSensitive: false),
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

  // infer debit/credit from common cues — ignores "credit card/debit card" noise & treats autopay as debit.
  // infer debit/credit from common cues (ignore "credit card"/"debit card" noise, treat autopay as debit)
  String? _inferDirection(String body) {
    final lower = body.toLowerCase();
    // strip card type tokens so "credit" inside "credit card" doesn't influence direction
    final cleaned = lower
        .replaceAll(RegExp(r'\bcredit\s+card\b'), '')
        .replaceAll(RegExp(r'\bdebit\s+card\b'), '');

    final strongCredit = RegExp(
      r'(has\s*been\s*credited|credited\s*(?:by|with)|amount\s*credited)',
      caseSensitive: false,
    ).hasMatch(lower);
    final strongDebit = RegExp(
      r'(has\s*been\s*debited|debited|amount\s*debited)',
      caseSensitive: false,
    ).hasMatch(lower);

    if (strongCredit && !strongDebit) return 'credit';
    if (strongDebit && !strongCredit) return 'debit';

    final isDR = RegExp(r'\bdr\b').hasMatch(cleaned);
    final isCR = RegExp(r'\bcr\b').hasMatch(cleaned);

    // autopay / mandate → debit even if an explicit debit verb is missing
    final hasAutopay = RegExp(r'\b(auto[-\s]?debit|autopay|nach|e-?mandate|mandate)\b')
        .hasMatch(cleaned);

    final debit = RegExp(
      r'\b(debit(?:ed)?|spent|purchase|paid|payment|pos|upi(?:\s*payment)?|imps|neft|rtgs|withdrawn|withdrawal|atm|charge[ds]?|recharge(?:d)?|bill\s*paid)\b',
      caseSensitive: false,
    ).hasMatch(cleaned) || hasAutopay;

    final credit = RegExp(
      r'\b(credit(?:ed)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
      caseSensitive: false,
    ).hasMatch(cleaned);

    if ((debit || isDR) && !(credit || isCR)) return 'debit';
    if ((credit || isCR) && !(debit || isDR)) return 'credit';

    // both seen → whichever appears first after cleanup
    final dIdx = RegExp(
      r'debit|spent|purchase|paid|payment|dr|auto[-\s]?debit|autopay|nach|mandate',
      caseSensitive: false,
    ).firstMatch(cleaned)?.start ?? -1;

    final cIdx = RegExp(
      r'credit(?!\s*card)|received|rcvd|deposit|salary|refund|cr',
      caseSensitive: false,
    ).firstMatch(cleaned)?.start ?? -1;

    if (dIdx >= 0 && cIdx >= 0) return dIdx < cIdx ? 'debit' : 'credit';
    return null;
  }


  // Merchant extraction with "Merchant Name:" / "for ..." / known brands
  String? _guessMerchantSmart(String text) {
    final t = text.toUpperCase();

    // 1) explicit "Merchant Name:"
    final m1 = RegExp(r'MERCHANT\s*NAME\s*[:\-]\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m1 != null) {
      final v = m1.group(1)!.trim();
      if (v.isNotEmpty) return v;
    }

    // 2) “for <merchant>” after autopay/purchase/txn cues
    final m2 = RegExp(r'\b(AUTOPAY|AUTO[-\s]?DEBIT|TXN|TRANSACTION|PURCHASE|PAYMENT)\b[^A-Z0-9]{0,40}\bFOR\b\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m2 != null) {
      final v = m2.group(2)!.trim();
      if (v.isNotEmpty) return v;
    }

    // 3) known brands (quick path)
    final known = <String>[
      'OPENAI','NETFLIX','AMAZON PRIME','PRIME VIDEO','SPOTIFY','YOUTUBE','GOOGLE *YOUTUBE',
      'APPLE.COM/BILL','APPLE','MICROSOFT','ADOBE','SWIGGY','ZOMATO','HOTSTAR','DISNEY+ HOTSTAR',
      'SONYLIV','AIRTEL','JIO','VI','HATHWAY','ACT FIBERNET','BOOKMYSHOW','BIGTREE','OLA','UBER',
      'IRCTC','REDBUS','AMAZON','FLIPKART','MEESHO','BLINKIT','ZEPTO'
    ];
    for (final k in known) {
      final idx = t.indexOf(k);
      if (idx >= 0) {
        final windowStart = idx - 60 < 0 ? 0 : idx - 60;
        final windowEnd = idx + 60 > t.length ? t.length : idx + 60;
        final w = t.substring(windowStart, windowEnd);
        final nearVerb = _hasDebitVerb(w) || _hasCreditVerb(w);
        final nearAmt = _hasCurrencyAmount(w);
        if (nearVerb || nearAmt) return k;
      }
    }

    // 4) “at|to <merchant>”
    final m3 = RegExp(r'\b(AT|TO)\b\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m3 != null) {
      final v = m3.group(2)!.trim();
      if (v.isNotEmpty) return v;
    }

    return null;
  }

  bool _isCard(String? instrument) =>
      instrument != null && {
        'CREDIT CARD','DEBIT CARD','CARD','ATM','POS'
      }.contains(instrument.toUpperCase());

  bool _looksCredit(String text) {
    final t = text.toLowerCase();
    return t.contains('credit card') || t.contains('cc txn') || t.contains('cc transaction');
  }

  String? _inferInstrument(String text) {
    final t = text.toUpperCase();
    final hasEmiCue =
        RegExp(r'\b(EMI|AUTOPAY|AUTO[- ]?DEBIT|NACH|E-?MANDATE|MANDATE)\b')
            .hasMatch(t);
    final accountLast4 = _extractAccountLast4(text);
    final hasCardCue = _hasStrongCardCue(text);

    if (hasEmiCue && accountLast4 != null) return 'Bank Account';

    if (RegExp(r'\bUPI\b').hasMatch(t) || t.contains('VPA')) return 'UPI';
    if (RegExp(r'\bIMPS\b').hasMatch(t)) return 'IMPS';
    if (RegExp(r'\bNEFT\b').hasMatch(t)) return 'NEFT';
    if (RegExp(r'\bRTGS\b').hasMatch(t)) return 'RTGS';
    if (RegExp(r'\bATM\b').hasMatch(t)) return 'ATM';
    if (RegExp(r'\bPOS\b').hasMatch(t)) return 'POS';
    if (RegExp(r'WALLET|PAYTM WALLET|AMAZON PAY', caseSensitive: false)
        .hasMatch(text)) return 'Wallet';
    if (RegExp(r'NETBANKING|NET BANKING', caseSensitive: false).hasMatch(text)) {
      return 'NetBanking';
    }

    if (hasCardCue) {
      if (RegExp(r'\bDEBIT CARD\b').hasMatch(t) ||
          RegExp(r'\bDC\b').hasMatch(t) ||
          RegExp(r'\bATM\b|\bPOS\b').hasMatch(t)) {
        return 'Debit Card';
      }
      if (RegExp(r'\bCREDIT CARD\b').hasMatch(t) ||
          RegExp(r'\bCC\b').hasMatch(t) ||
          RegExp(r'VISA|MASTERCARD|RUPAY|AMEX|DINERS').hasMatch(t)) {
        return 'Credit Card';
      }
      return 'Card';
    }

    if (accountLast4 != null) return 'Bank Account';

    return null;
  }

  String? _inferCardNetwork(String text) {
    final t = text.toUpperCase();
    if (t.contains('VISA')) return 'VISA';
    if (t.contains('MASTERCARD') || t.contains('MASTER CARD')) return 'MASTERCARD';
    if (t.contains('RUPAY') || t.contains('RU-PAY')) return 'RUPAY';
    if (t.contains('AMEX') || t.contains('AMERICAN EXPRESS')) return 'AMEX';
    if (t.contains('DINERS')) return 'DINERS';
    return null;
  }

  bool _looksInternational(String text) {
    final t = text.toLowerCase();
    return t.contains('international') || t.contains('foreign');
  }

  Future<void> recategorizeLastWindow({
    required String userId,
    int windowHours = 24,
    int batch = 50,
  }) async {
    if (!AUTO_RECAT_LAST_24H || !AiConfig.llmOn || batch <= 0) return;

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

        final merchantField =
            (data['merchant'] as String? ?? data['counterparty'] as String? ?? '')
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
        final enrichedDesc = hintParts.join('; ') + '; ' + preview;

        candidates.add(_RecatCandidate(
          docRef: doc.reference,
          raw: TxRaw(
            amount: amount,
            currency: 'INR',
            regionCode: 'IN',
            merchant:
                merchantField.isNotEmpty ? merchantField : 'MERCHANT',
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

        updates.add(candidates[i]
            .docRef
            .set(payload, SetOptions(merge: true)));
      }

      if (updates.isNotEmpty) {
        await Future.wait(updates);
      }
    }
  }

  Map<String, double> _extractFees(String text) {
    final Map<String, double> out = {};
    double? _firstAmountAfter(RegExp pat) {
      final m = pat.firstMatch(text);
      if (m == null) return null;
      final after = text.substring(m.end);
      final a = RegExp(r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\.\d{1,2})?)', caseSensitive: false)
          .firstMatch(after);
      if (a != null) {
        final v = double.tryParse((a.group(1) ?? '').replaceAll(',', ''));
        return v;
      }
      return null;
    }

    final pairs = <String, RegExp>{
      'convenience': RegExp(r'\b(convenience\s*fee|conv\.?\s*fee|gateway\s*charge)\b', caseSensitive: false),
      'gst': RegExp(r'\b(GST|IGST|CGST|SGST)\b', caseSensitive: false),
      'markup': RegExp(r'\b(markup|forex\s*markup|intl\.?\s*markup)\b', caseSensitive: false),
      'surcharge': RegExp(r'\b(surcharge|fuel\s*surcharge)\b', caseSensitive: false),
      'late_fee': RegExp(r'\b(late\s*fee|late\s*payment\s*fee|penalty)\b', caseSensitive: false),
      'processing': RegExp(r'\b(processing\s*fee)\b', caseSensitive: false),
    };

    pairs.forEach((k, rx) {
      final v = _firstAmountAfter(rx);
      if (v != null && v > 0) out[k] = v;
    });
    return out;
  }

  String? _guessIssuerBankFromBody(String body) {
    final t = body.toUpperCase();
    if (t.contains('HDFC')) return 'HDFC';
    if (t.contains('ICICI')) return 'ICICI';
    if (t.contains('SBI')) return 'SBI';
    if (t.contains('AXIS')) return 'AXIS';
    if (t.contains('KOTAK')) return 'KOTAK';
    if (t.contains('YES')) return 'YES';
    if (t.contains('IDFC')) return 'IDFC';
    if (t.contains('BANK OF BARODA') || t.contains('BOB')) return 'BOB';
    return null;
  }

  String _deriveCounterparty({
    required String merchantNorm,
    required String? paidTo,
    required String? upiVpa,
    required String? last4,
    required String? bank,
    required String? domain,
    required String rawText,
    required String direction,
    required bool isEmiAutopay,
  }) {
    String? normalize(String? value) =>
        value == null ? null : value.trim().toUpperCase();

    /// Try to extract a "FROM <NAME>" style sender for credit flows,
    /// making sure we don't just return generic words like "YOUR ACCOUNT".
    String? extractFromName(String text) {
      final rx = RegExp(
        r'\bfrom\s+([A-Za-z0-9 .&\-\(\)/]{3,40})',
        caseSensitive: false,
      );
      final m = rx.firstMatch(text);
      if (m == null) return null;

      var candidate = (m.group(1) ?? '').trim();
      if (candidate.isEmpty) return null;

      final upper = candidate.toUpperCase();

      // Skip very generic / self-account phrases
      if (upper.startsWith('YOUR ')) return null;
      if (upper.contains('ACCOUNT') || upper.contains('A/C')) return null;
      if (upper.contains('ACCT')) return null;

      // Skip if it just repeats the bank name
      if (bank != null && bank.trim().isNotEmpty) {
        final b = bank.trim().toUpperCase();
        if (upper.contains(b)) return null;
      }

      return upper;
    }

    final paidToNorm = normalize(paidTo);

    // For DEBIT: keep old priority → paidTo → UPI → merchant → EMI → fallbacks.
    if (direction == 'debit') {
      if (paidToNorm != null && paidToNorm.isNotEmpty) return paidToNorm;

      if (upiVpa != null && upiVpa.trim().isNotEmpty) {
        return upiVpa.trim().toUpperCase();
      }

      if (merchantNorm.isNotEmpty) return merchantNorm;

      if (isEmiAutopay) return 'EMI AUTOPAY';

      if (last4 != null && last4.isNotEmpty) return 'CARD $last4';
      if (bank != null) return bank;
      if (domain != null && domain.trim().isNotEmpty) return domain.toUpperCase();
      return 'UNKNOWN';
    }

    // For CREDIT: try to strongly prefer a real "FROM <NAME>" sender.
    if (direction == 'credit') {
      // 1) PaidTo (if somehow present on a credit alert)
      if (paidToNorm != null && paidToNorm.isNotEmpty) return paidToNorm;

      // 2) Explicit FROM <NAME> in the email body
      final fromName = extractFromName(rawText);
      if (fromName != null && fromName.isNotEmpty) {
        return fromName;
      }

      // 3) If no FROM, but we have a normalized merchant (refunds, payouts),
      //    use that as "Got from <MERCHANT>"
      if (merchantNorm.isNotEmpty) return merchantNorm;

      // 4) UPI sender as fallback
      if (upiVpa != null && upiVpa.trim().isNotEmpty) {
        return upiVpa.trim().toUpperCase();
      }

      // 5) If it's an EMI autopay reversal or similar
      if (isEmiAutopay) return 'EMI AUTOPAY';

      // 6) Bank/card fallbacks
      if (last4 != null && last4.isNotEmpty) return 'CARD $last4';
      if (bank != null) return bank;
      if (domain != null && domain.trim().isNotEmpty) return domain.toUpperCase();
      return 'SENDER';
    }

    // Unknown direction: behave conservatively
    if (last4 != null && last4.isNotEmpty) return 'CARD $last4';
    if (bank != null) return bank;
    if (domain != null && domain.trim().isNotEmpty) return domain.toUpperCase();
    return 'UNKNOWN';
  }

  String _deriveCounterpartyType({
    required String merchantNorm,
    required String? upiVpa,
    required String? instrument,
    required String direction,
  }) {
    if (upiVpa != null && upiVpa.isNotEmpty) return 'UPI_P2P';
    if (merchantNorm.isNotEmpty) return 'MERCHANT';
    if (instrument != null && instrument.toUpperCase().contains('CARD')) return 'MERCHANT';
    return direction == 'credit' ? 'SENDER' : 'RECIPIENT';
  }

  List<String> _buildTags({
    required String? instrument,
    required bool isIntl,
    required bool hasFees,
    List<String> extra = const [],
  }) {
    final List<String> tags = [];
    if (instrument != null) {
      final i = instrument.toUpperCase();
      if (i.contains('UPI')) tags.add('upi');
      if (i.contains('CREDIT')) tags.addAll(['card','credit_card']);
      if (i.contains('DEBIT')) tags.addAll(['card','debit_card']);
      if (i == 'IMPS') tags.add('imps');
      if (i == 'NEFT') tags.add('neft');
      if (i == 'RTGS') tags.add('rtgs');
      if (i == 'ATM') tags.add('atm');
      if (i == 'POS') tags.add('pos');
      if (i == 'RECHARGE') tags.add('recharge');
      if (i == 'WALLET') tags.add('wallet');
    }
    if (isIntl) tags.addAll(['international','forex']);
    if (hasFees) tags.add('fee');
    tags.addAll(extra);
    final seen = <String>{};
    return tags.where((t) => seen.add(t)).toList();
  }

  List<String> _extraTagsFromText(String text) {
    final t = text.toLowerCase();
    final out = <String>[];
    if (RegExp(r'\bauto[- ]?debit|autopay|nach|mandate|e\s*mandate\b').hasMatch(t)) out.add('autopay');
    if (RegExp(r'\bemi\b').hasMatch(t)) out.add('loan_emi');
    if (RegExp(r'\bsubscription|renew(al)?|membership\b').hasMatch(t)) out.add('subscription');
    final feeNouns = RegExp(
      r'\b(surcharge|penalty|late\s*fee|convenience\s*fee|processing\s*fee|service\s*charge|finance\s*charge)\b',
      caseSensitive: false,
    );
    try {
      if (feeNouns.hasMatch(t) || _extractFees(text).isNotEmpty) {
        out.add('charges');
      }
    } catch (_) {
      // ignore parsing errors; best-effort tagging only
    }
    if (RegExp(r'\brecharge|prepaid|dth\b').hasMatch(t)) out.add('recharge');
    if (RegExp(r'\b(petrol|diesel|fuel|filling\s*station|gas\s*station)\b')
            .hasMatch(t) ||
        t.contains('hpcl') ||
        t.contains('bharat petroleum') ||
        t.contains('bpcl') ||
        t.contains('indian oil') ||
        t.contains('iocl') ||
        t.contains('shell') ||
        t.contains('nayara') ||
        t.contains('jio-bp') ||
        t.contains('smartdrive')) {
      out.add('fuel');
    }
    return out;
  }

  DateTime? _parseLooseDate(String s) {
    try {
      final a = s.trim();
      final bySlash = RegExp(r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$').hasMatch(a);
      if (bySlash) {
        final parts = a.contains('/') ? a.split('/') : a.split('-');
        final d = int.parse(parts[0]);
        final m = int.parse(parts[1]);
        final y = (parts[2].length == 2) ? (2000 + int.parse(parts[2])) : int.parse(parts[2]);
        return DateTime(y, m, d);
      }
      final byText = RegExp(r'^\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4}$').hasMatch(a);
      if (byText) {
        final m = RegExp(r'[A-Za-z]{3}').firstMatch(a)!.group(0)!.toLowerCase();
        const months = {
          'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12
        };
        final d = int.parse(RegExp(r'^\d{1,2}').firstMatch(a)!.group(0)!);
        final yMatch = RegExp(r'\d{2,4}$').firstMatch(a);
        final y = (yMatch != null && yMatch.group(0)!.length == 2)
            ? 2000 + int.parse(yMatch.group(0)!)
            : int.parse(yMatch?.group(0) ?? DateTime.now().year.toString());
        return DateTime(y, months[m]!, d);
      }
      return DateTime.tryParse(a);
    } catch (_) {
      return null;
    }
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
class _BillInfo {
  final double? totalDue;
  final double? minDue;
  final DateTime? dueDate;
  final DateTime? statementStart;
  final DateTime? statementEnd;
  _BillInfo({
    this.totalDue,
    this.minDue,
    this.dueDate,
    this.statementStart,
    this.statementEnd,
  });
}
