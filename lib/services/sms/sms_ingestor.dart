// lib/services/sms/sms_ingestor.dart
import 'dart:collection';
import 'dart:math' as math;
import 'package:telephony/telephony.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../expense_service.dart';
import '../income_service.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';

import 'sms_permission_helper.dart';
import '../ingest_index_service.dart';
import '../ingest_filters.dart'; // expects: isLikelyPromo, guessBankFromSms
import '../tx_key.dart';

// 🧠 Brain suggestions
import '../../brain/brain_enricher_service.dart';

// ✅ Per-user ingest state (cutoff + progress – review flag is ignored)
import '../ingest_state_service.dart';

// 🔍 Parser + suggestions (no hard category writes)
import '../tx_analyzer.dart';

// 🧼 Clean user-facing notes
import '../note_sanitizer.dart';

/// SMS Ingestor (trust-first parser + suggester)
/// - Strict promo/ad & usage-alert filters
/// - TxAnalyzer-powered extraction (amount/date/merchant/channel)
/// - Category only suggested (stored as suggestedCategory + confidence)
/// - Clean, compact user-visible notes; full raw kept under sourceRecord
/// - Cross-source dedupe via IngestIndexService.claim(txKey)
/// - Deterministic Firestore doc IDs (prevents dup docs)
/// - Recent-event guard to avoid OEM double callbacks
class SmsIngestor {
  SmsIngestor._();
  static final SmsIngestor instance = SmsIngestor._();

  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool USE_SERVICE_WRITES = false;       // use direct writes by default
  static const bool AUTO_POST_TXNS = true;            // 🚀 post straight to expenses/incomes when valid
  static const bool CONSERVATIVE_SUB_AUTOPAY = false; // allow first-time autopays too
  static const bool SUGGESTION_MODE = true;           // do NOT write category automatically

  final Telephony _telephony = Telephony.instance;
  final ExpenseService _expense = ExpenseService();
  final IncomeService _income = IncomeService();
  final IngestIndexService _index = IngestIndexService();

  // Recent event guard (some OEMs fire multiple callbacks)
  static const int _recentCap = 400;
  final ListQueue<String> _recent = ListQueue<String>(_recentCap);

  // TxAnalyzer (ML Kit optional; falls back to regex internally)
  final TxAnalyzer _analyzer = TxAnalyzer(
    config: TxAnalyzerConfig(
      enableMlKit: true,
      autoApproveThreshold: 0.90, // we don't auto-commit category anyway
      minHighPrecisionConf: 0.88,
    ),
  );

  /// Optional init for older callers
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

  // ── Public API ──────────────────────────────────────────────────────────────

  Future<void> initialBackfill({
    required String userPhone,
    int newerThanDays = 1000,
  }) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    // Ensure ingest state exists (for cutoff/progress)
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
        ingestState: state, // reuse same state during this run
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
      // Some OEMs restrict background listeners; swallow safely.
    }
  }

  Future<void> syncDelta({
    required String userPhone,
    int? overlapHours,   // new preferred
    int? lookbackHours,  // legacy alias from old callers
  }) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final overlap = overlapHours ?? lookbackHours ?? 24;

    // Watermark-aware window: (lastSmsTs - overlap) → now
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
        since = now.subtract(const Duration(days: 1000)); // fallback like initial
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

  // ── Core handler ────────────────────────────────────────────────────────────

  Future<void> _handleOne({
    required String userPhone,
    required String body,
    required DateTime ts,
    String? address,
    dynamic ingestState, // avoid compile-coupling on fields like `cutoff`
  }) async {
    // 0) Drop promos/ads, usage alerts, OTP-only, and pure balance/info pings
    if (_isPromotionOrAd(body) || _isUsageOrQuotaAlert(body) || isLikelyPromo(body) || _looksLikeOtpOnly(body) || _isPureBalanceInfo(body)) {
      return;
    }

    // 1) Parse with TxAnalyzer (amount, date, merchant, channel, ref) + suggestion
    final analysis = await _analyzer.analyze(rawText: body);
    final parsed = analysis.parse;

    final amountInr = parsed.amount;
    final isUPI = parsed.isUPI;
    final isP2M = parsed.isP2M;
    final upiRef = parsed.reference;
    final canonicalMerchant = parsed.merchant;

    // Suggested category (do NOT commit to 'category'; suggestion only)
    var suggestedCategory = analysis.category.category;
    var categoryConfidence = analysis.category.confidence ?? 0.0;
    var categorySource = _topSignal(analysis.category.reasons);

    // 2) Direction cues (prefer analyzer debit; override if strong credit cue)
    String? type = parsed.isDebit ? 'debit' : null;

    final lower = body.toLowerCase();
    final debitRe = RegExp(
      r'\b('
      r'debit(?:ed)?|spent|purchase|paid|payment|pos|upi(?:\s*payment)?|imps|neft|rtgs|withdrawn|withdrawal|atm|charge[ds]?|'
      r'recharge(?:d)?|bill\s*paid|autopay|auto[-\s]?debit|standing\s*instruction|si\b|e[-\s]?mandate|enach|nach|ecs|ach'
      r')\b',
      caseSensitive: false,
    );
    final creditRe = RegExp(
      r'\b(credit(?:ed)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
      caseSensitive: false,
    );
    final isDR = RegExp(r'\bDR\b', caseSensitive: false).hasMatch(body);
    final isCR = RegExp(r'\bCR\b', caseSensitive: false).hasMatch(body);
    final looksDebit = debitRe.hasMatch(lower) || isDR;
    final looksCredit = creditRe.hasMatch(lower) || isCR;

    // If strong credit cues and analyzer didn't force debit, mark as credit
    if (!parsed.isDebit && looksCredit && !looksDebit) {
      type = 'credit';
    } else if (looksDebit && looksCredit) {
      // pick the earliest cue
      final dIdx = debitRe.firstMatch(lower)?.start ?? -1;
      final cIdx = creditRe.firstMatch(lower)?.start ?? -1;
      if (dIdx >= 0 && cIdx >= 0) type = dIdx < cIdx ? 'debit' : 'credit';
    }

    Map<String, dynamic>? _extractAutopayInfo(String body) {
      final b = body.toLowerCase();
      String? platform;
      if (RegExp(r'\bupi\s*auto ?pay\b', caseSensitive: false).hasMatch(b)) {
        platform = 'UPI AutoPay';
      } else if (RegExp(r'\b(e[-\s]?mandate|enach|nach)\b', caseSensitive: false).hasMatch(b)) {
        platform = 'NACH/eMandate';
      } else if (RegExp(r'\b(standing\s*instruction|si\b)\b', caseSensitive: false).hasMatch(b)) {
        platform = 'Standing Instruction';
      } else if (RegExp(r'\b(ecs|ach)\b', caseSensitive: false).hasMatch(b)) {
        platform = 'ECS/ACH';
      }

      final umrn = RegExp(r'\bUMRN[:\s\-]*([A-Z0-9\-]+)', caseSensitive: false).firstMatch(body)?.group(1);
      final mandate = RegExp(r'\bmandate(?:\s*id)?[:\s\-]*([A-Z0-9\-]+)', caseSensitive: false).firstMatch(body)?.group(1);
      if (platform == null && umrn == null && mandate == null) return null;
      return {
        'platform': platform,
        if (umrn != null) 'umrn': umrn,
        if (mandate != null) 'mandateId': mandate,
      };
    }

    // Optional FX fallback if no INR amount detected
    Map<String, dynamic>? fx;
    if (amountInr == null) {
      fx = _extractFx(body);
    }
    if (amountInr == null && fx == null) return;              // need an amount
    if (amountInr != null && amountInr <= 0.0) return;        // reject 0/negative
    if (type == null && amountInr == null) return;            // nothing strong

    // 3) Bank + last4 + merchantKey
    final bank = guessBankFromSms(address: address, body: body);
    String? last4 = RegExp(r'(?:XX|x{2,}|ending|acct|a/c)[^\d]*(\d{4})', caseSensitive: false)
        .firstMatch(body)
        ?.group(1);

    String? merchant = canonicalMerchant ?? _guessMerchant(body);

    // 🔎 Quick-commerce detection → suggest 'Online Groceries'
    final _qc = _quickCommerceSuggest(body, seedMerchant: merchant);
    if (_qc != null) {
      if ((suggestedCategory == null) || (categoryConfidence < 0.85)) {
        suggestedCategory = _qc['category'] as String;
        categorySource = 'quickCommerceRule';
      }
      categoryConfidence = math.max(categoryConfidence, (_qc['confidence'] as double));
      merchant ??= _qc['merchant'] as String?;
    }

    final merchantKey = (merchant ?? last4 ?? bank ?? 'UNKNOWN').toUpperCase();

    // 4) Stable cross-source key & dedupe
    final key = buildTxKey(
      bank: bank,
      amount: amountInr ?? fx?['amount'],
      time: ts,
      type: (type ?? 'unknown'),
      last4: last4,
    );

    final claimed = await _index.claim(userPhone, key, source: 'sms').catchError((_) => false);
    if (claimed != true) return;

    // 5) Ingest state/cutoff
    final st = ingestState ?? await IngestStateService.instance.get(userPhone);
    final cutoff = _extractCutoff(st); // DateTime? or null if undefined
    // ✅ Fix: we only ingest messages AFTER the cutoff
    final isAfterCutoff = (cutoff == null) ? true : ts.isAfter(cutoff);

    // 6) Autopay/subscription signals
    final autopayInfo = _extractAutopayInfo(body);
    final isSubOrAutopay = (autopayInfo != null) || _looksLikeSubscription(body);

    // 7) Brain enrichment (keep raw body for semantic signals)
    Map<String, dynamic>? brain;
    try {
      if (type == 'debit' || type == null) {
        final probe = ExpenseItem(
          id: 'probe',
          type: 'SMS Debit',
          amount: amountInr ?? (fx?['amount'] ?? 0.0),
          note: body, // raw for brain models
          date: ts,
          payerId: userPhone,
          cardLast4: last4,
        );
        brain = BrainEnricherService().buildExpenseBrainUpdate(probe);
      } else {
        final probe = IncomeItem(
          id: 'probe',
          type: 'SMS Credit',
          amount: amountInr ?? 0.0,
          note: body, // raw for brain models
          date: ts,
          source: 'SMS',
        );
        brain = BrainEnricherService().buildIncomeBrainUpdate(probe);
      }
    } catch (_) {}
    if (isSubOrAutopay) {
      brain ??= {};
      brain!.addAll({
        'isRecurringCandidate': true,
        'merchantKey': merchantKey,
        if (merchant != null) 'merchant': merchant,
        if (autopayInfo != null) 'autopay': autopayInfo,
      });
    }
    // Tag quick-commerce in brain (helps insights, no schema changes)
    if (_qc != null) {
      brain ??= {};
      brain!.addAll({
        'isQuickCommerce': true,
        'categoryHint': 'Online Groceries',
      });
    }

    // 8) Build clean note for UI
    final clean = NoteSanitizer.build(raw: body, parse: parsed);

    // 9) Auto-post gate (amount + direction + cutoff)
    bool seenRecurringBefore = false;
    if (CONSERVATIVE_SUB_AUTOPAY && isSubOrAutopay && amountInr != null) {
      seenRecurringBefore = await _seenRecurringBefore(userPhone, merchantKey, amountInr, ts);
    }

    final canAutopost = AUTO_POST_TXNS
        && isAfterCutoff
        && (type != null)
        && ((amountInr != null) || (fx != null))
        && (!CONSERVATIVE_SUB_AUTOPAY || !isSubOrAutopay || seenRecurringBefore);

    // 10) Source metadata (include analyzer + sanitizer info)
    final sourceMeta = {
      'type': 'sms',
      'raw': body,                           // full raw kept for audit
      'rawPreview': clean.rawPreview,        // short, cleaned preview
      'at': Timestamp.fromDate(ts),
      if (address != null) 'address': address,
      if (upiRef != null) 'upiRef': upiRef,
      if (autopayInfo != null) 'autopay': autopayInfo,
      if (merchant != null) 'merchant': merchant,
      'analyzer': {
        'isUPI': isUPI,
        'isP2M': isP2M,
        'reasons': analysis.category.reasons,
        'suggestedCategory': suggestedCategory,   // may be QC override
        'categoryConfidence': categoryConfidence, // merged confidence
        'categorySource': categorySource,
      },
      'sanitizer': {
        'removedLines': clean.removedLines,
        'tags': clean.tags,
      },
      if (_qc != null) 'merchantTags': (_qc['tags'] as List<String>),
    };

    if (canAutopost) {
      final docId = _docIdFromKey(key); // deterministic -> no dup docs
      if (type == 'debit') {
        final expRef = FirebaseFirestore.instance
            .collection('users').doc(userPhone)
            .collection('expenses').doc(docId);
        final e = ExpenseItem(
          id: expRef.id,
          type: 'SMS Debit',
          amount: (amountInr ?? fx?['amount'])!,
          note: clean.note, // 👈 clean, compact note
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
          // 👇 suggestion-only fields; category remains null until user confirms
          'suggestedCategory': suggestedCategory,
          'categoryConfidence': categoryConfidence,
          'categorySource': categorySource,
          'category': null,
          if (brain != null) ...brain,
        }, SetOptions(merge: true));
      } else {
        final incRef = FirebaseFirestore.instance
            .collection('users').doc(userPhone)
            .collection('incomes').doc(docId);
        final i = IncomeItem(
          id: incRef.id,
          type: 'SMS Credit',
          amount: (amountInr ?? fx?['amount'])!,
          note: clean.note, // 👈 clean, compact note
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
          // 👇 suggestion-only fields; category remains null until user confirms
          'suggestedCategory': suggestedCategory,
          'categoryConfidence': categoryConfidence,
          'categorySource': categorySource,
          'category': null,
          if (brain != null) ...brain,
        }, SetOptions(merge: true));
      }
      return;
    }

    // If we can’t safely auto-post (no valid amount or unclear direction), just drop it.
    return;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Safely extract a cutoff from a dynamic ingest state (DateTime or Timestamp or absent)
  DateTime? _extractCutoff(dynamic st) {
    try {
      final c = (st as dynamic)?.cutoff;
      if (c is DateTime) return c;
      if (c is Timestamp) return c.toDate();
    } catch (_) {}
    return null;
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

  // Pick the top signal name from reasons map
  String _topSignal(Map<String, double> r) {
    if (r.isEmpty) return 'none';
    final list = r.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return list.first.key;
  }

  // A real transaction message tends to include “confirmation cues”.
  bool _hasConfirmationCue(String lower) {
    return RegExp(
      r'(successful|successfully|has\s+been|was\s+|done|processed|posted|debited|credited|spent|charged|paid)',
      caseSensitive: false,
    ).hasMatch(lower);
  }

  // Treat as marketing if it looks like an offer/cta or topup/recharge upsell and there is NO confirmation cue.
  bool _isPromotionOrAd(String body) {
    final lower = body.toLowerCase();

    // Transaction verbs we care about (same family used in _extractAmountInr)
    final txnVerb = RegExp(
      r'\b(debit(?:ed)?|credit(?:ed)?|received|rcvd|deposit(?:ed)?|spent|purchase|paid|payment|withdrawn|transfer(?:red)?|txn|transaction|upi|recharge(?:d)?)\b',
      caseSensitive: false,
    );
    final hasTxnVerb = txnVerb.hasMatch(lower);
    final hasConfirm = _hasConfirmationCue(lower);

    // Common promo cues
    final promoWords = RegExp(
      r'(shop\s*now|use\s*code|coupon|offer|flat\s*\d+|%\s*off|off\b|sale|hurry|limited\s*time|t&c|refer|referral|upgrade\s*to|down\s*payment|emi\s+at)',
      caseSensitive: false,
    );

    // Upsell topup/recharge/pack/add-on/booster + Rs amount
    final topupUpsell = RegExp(
      r'\b(get|buy)\b.*\b(top[- ]?up|topup|recharge|pack|add[- ]?on|addon|booster)\b.*(?:rs\.?|inr|₹)\s*\d',
      caseSensitive: false,
    );

    // URL heavy (shorteners/marketing)
    final hasMarketingLink = RegExp(
      r'https?://[^\s]+|(bit\.ly|tinyurl\.com|t\.co|lnkd\.in|linktr\.ee|r\.bflcomm\.in|i\.airtel\.in|u\d\.[a-z0-9\-]+\.[a-z]{2,})',
      caseSensitive: false,
    ).hasMatch(lower);

    // If this is a topup/recharge **upsell** and there is no confirmation cue → promo.
    if (topupUpsell.hasMatch(lower) && !hasConfirm) return true;

    // General promo: No txn verb AND promo cues/link/amount-off language.
    if (!hasTxnVerb && (promoWords.hasMatch(lower) || hasMarketingLink)) {
      return true;
    }

    // “Rs ___ OFF/discount” etc.
    if (RegExp(r'((?:rs\.?|inr|₹)\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:off|discount))', caseSensitive: false).hasMatch(lower)) {
      return true;
    }

    return false;
  }

  // Usage/quota alerts like “50% data consumed”, “low balance, recharge to continue”
  bool _isUsageOrQuotaAlert(String body) {
    final lower = body.toLowerCase();
    final usage = RegExp(
      r'(data\s+consumed|data\s+usage|daily\s+high\s+speed\s+data|low\s+balance|balance\s+low|expire|validity|pack\s+ending|pack\s+expires)',
      caseSensitive: false,
    ).hasMatch(lower);
    final upsell = RegExp(r'(get|buy)\s+(?:more|extra|top[- ]?up|topup|recharge|pack|add[- ]?on|addon|booster)', caseSensitive: false).hasMatch(lower);
    return usage && upsell;
  }

  // ── Legacy helpers kept for rare fallbacks ─────────────────────────────────

  /// Capture foreign-currency spends like "Spent USD 23.6", "Purchase EUR 12.00".
  /// Returns {'currency': 'USD', 'amount': 23.6} or null.
  Map<String, dynamic>? _extractFx(String text) {
    final pats = <RegExp>[
      RegExp(r'(spent|purchase|txn|transaction|charged)\s+(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)', caseSensitive: false),
      RegExp(r'\b(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)\b\s*(spent|purchase|txn|transaction|charged)', caseSensitive: false),
      RegExp(r'(txn|transaction)\s*of\s*(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)', caseSensitive: false),
    ];
    for (final re in pats) {
      final m = re.firstMatch(text);
      if (m != null) {
        final tokens = m.groups([1,2,3]);
        String cur;
        String amtStr;
        if (re.pattern.startsWith('(spent')) {
          cur = tokens[1]!.toUpperCase();
          amtStr = tokens[2]!;
        } else if (re.pattern.startsWith(r'\b(usd')) {
          cur = tokens[0]!.toUpperCase();
          amtStr = tokens[1]!;
        } else {
          cur = tokens[1]!.toUpperCase();
          amtStr = tokens[2]!;
        }
        final amt = double.tryParse(amtStr);
        if (amt != null) return {'currency': cur, 'amount': amt};
      }
    }
    return null;
  }

  String? _guessMerchant(String body) {
    final t = body.toUpperCase();
    final known = <String>[
      'NETFLIX','AMAZON PRIME','PRIME VIDEO','SPOTIFY','YOUTUBE','GOOGLE *YOUTUBE',
      'APPLE.COM/BILL','APPLE','MICROSOFT','ADOBE','SWIGGY ONE','ZOMATO GOLD','HOTSTAR','DISNEY+ HOTSTAR',
      'SONYLIV','AIRTEL','JIO','VI','HATHWAY','ACT FIBERNET','BOOKMYSHOW','BIGTREE','OLA','UBER','IRCTC',
      'REDBUS','AMAZON','FLIPKART','MEESHO',
      // 🛒 Quick commerce & supermarkets
      'BLINKIT','GROFERS','ZEPTO','INSTAMART','SWIGGY INSTAMART','BIGBASKET','BBDAILY',
      'DMART','STAR BAZAAR','STAR BAZAR','STAR MARKET','RATNADEEP','JIOMART',
      'RELIANCE SMART BAZAAR','RELIANCE FRESH','RELIANCE SMART','MORE SUPERMARKET',
      'SPENCER\'S','NATURE\'S BASKET','LICIOUS','FRESHTOHOME'
    ];
    for (final k in known) { if (t.contains(k)) return k; }
    final m = RegExp(r'\b(for|towards|at)\b\s*([A-Z0-9\*\._\- ]{3,25})').firstMatch(t);
    return m?.group(2)?.trim();
  }

  bool _looksLikeSubscription(String body) {
    return RegExp(r'\b(subscription|renewal|auto\s*renew|recurring)\b', caseSensitive: false).hasMatch(body);
  }

  /// Ignore pure balance / available limit reports (incl. Angel One fund/securities bal)
  bool _isPureBalanceInfo(String body) {
    final lower = body.toLowerCase();
    final hasBalanceWords = RegExp(
        r'(available\s*limit|avl\s*limit|available\s*balance|account\s*balance|fund\s*bal|securities\s*bal|\bbal\b)',
        caseSensitive: false).hasMatch(lower);

    final hasTxnVerb = RegExp(
        r'\b(debit(?:ed)?|credit(?:ed)?|received|rcvd|deposit(?:ed)?|spent|purchase|paid|payment|withdrawn|transfer(?:red)?|txn|transaction)\b',
        caseSensitive: false).hasMatch(lower);

    final isReporty = RegExp(r'\b(statement|report(ed)?)\b', caseSensitive: false).hasMatch(lower);

    return (hasBalanceWords && !hasTxnVerb) || (isReporty && !hasTxnVerb);
  }

  /// OTP-only detector (allow through only if there’s a real txn verb too)
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

  // ── Recurrence check for subscriptions/autopays ────────────────────────────
  Future<bool> _seenRecurringBefore(
      String userPhone,
      String merchantKey,
      double amount,
      DateTime ts,
      ) async {
    final from = ts.subtract(const Duration(days: 90));
    try {
      final q = await FirebaseFirestore.instance
          .collection('users').doc(userPhone).collection('expenses')
          .where('merchantKey', isEqualTo: merchantKey)
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .limit(15)
          .get();

      for (final d in q.docs) {
        final a = (d.data()['amount'] as num?)?.toDouble() ?? 0.0;
        if (a == 0) continue;
        final diff = (a - amount).abs() / a;
        if (diff <= 0.05) return true;
      }
    } catch (_) {}
    return false;
  }

  /// Quick-commerce matcher → returns canonical merchant + category suggestion.
  Map<String, dynamic>? _quickCommerceSuggest(String text, {String? seedMerchant}) {
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
      // ⚠️ Avoid generic "ZOMATO" as groceries; only match explicit markets.
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
