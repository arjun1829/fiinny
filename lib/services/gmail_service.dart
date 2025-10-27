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


class GmailService {
  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool AUTO_POST_TXNS = true;      // create expenses/incomes immediately
  static const bool USE_SERVICE_WRITES = false; // write via Firestore set(merge)
  static const int DEFAULT_OVERLAP_HOURS = 24;
  static const ReconcilePolicy RECONCILE_POLICY = ReconcilePolicy.mergeEnrich;
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

  // Extract UPI VPA (first one)
  String? _extractUpiVpa(String text) {
    final re = RegExp(r'\b([a-zA-Z0-9.\-_]{2,})@([a-zA-Z]{2,})\b');
    return re.firstMatch(text)?.group(0);
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
    final rx = RegExp(r'\bUPI\/P2A\/[^\/\s]{3,}\/([A-Z][A-Z0-9 \.\-]{2,})\/', caseSensitive: false);
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

  // ── New entry points ───────────────────────────────────────────────────────

  Future<void> initialBackfill({
    required String userId,
    int newerThanDays = 1000,
    int pageSize = 500,
  }) async {
    await IngestStateService.instance.ensureCutoff(userId);

    final since = TEST_MODE
        ? DateTime.now().subtract(const Duration(days: TEST_BACKFILL_DAYS))
        : DateTime.now().subtract(Duration(days: newerThanDays));

    await _fetchAndStage(userId: userId, since: since, pageSize: pageSize);
  }

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

    // ── Early skips & special routing (safe) ─────────────────────────────────
// Peek first for direction+amount so we don't drop real txns by mistake.
    final _peekFx = _extractFx(combined);
    final _peekAmt = _peekFx == null ? _extractAnyInr(combined) : (_peekFx['amount'] as double?);
    final _peekDir = _inferDirection(combined); // 'debit'|'credit'|null
    final _looksTxn = (_peekDir != null && (_peekAmt != null && _peekAmt > 0));

// Drop newsletters/promos ONLY if they do NOT look like a transaction.
    if (filt.isLikelyNewsletter(listId, fromHdr) && !_looksTxn) {
      if (_DEBUG) _log('drop: newsletter without txn signals');
      return null;
    }
    if (filt.isLikelyPromo(combined) && !_looksTxn) {
      if (_DEBUG) _log('drop: promo without txn signals');
      return null;
    }

// Balance alerts often include legit credits ("credited ... Avl bal ...").
// So ONLY drop balance alerts when there is NO clear txn signal.
    if (filt.isLikelyBalanceAlert(combined) && !_looksTxn) {
      if (_DEBUG) _log('drop: balance alert without txn signals');
      return null;
    }

// Card bill logic: allow card-bill notices; drop other statements/bills.
    final cardBillCue = filt.isLikelyCardBillNotice(combined);
    if (!cardBillCue && filt.isStatementOrBillNotice(combined) && !_looksTxn) {
      if (_DEBUG) _log('drop: statement/bill without txn signals');
      return null;
    }


    // Extract common signals
    final msgDate = DateTime.fromMillisecondsSinceEpoch(
      int.tryParse(msg.internalDate ?? '0') ?? DateTime.now().millisecondsSinceEpoch,
    );
    final emailDomain = _fromDomain(headers);
    final bank = _guessBankFromHeaders(headers) ?? _guessIssuerBankFromBody(combined);
    final last4 = _extractCardLast4(combined);
    final upiVpa = _extractUpiVpa(combined);
    final instrument = _inferInstrument(combined);
    final network = _inferCardNetwork(combined);
    final isIntl = _looksInternational(combined);
    final amountFx = _extractFx(combined);
    final amountInr = amountFx == null ? _extractAnyInr(combined) : null;
    final amount = amountInr ?? amountFx?['amount'] as double?;
    final fees = _extractFees(combined);
    final upiSender = _extractUpiSenderName(combined);

    // Card bill path FIRST
    final bill = _extractCardBillInfo(combined);
    if (bill != null) {
      final total = bill.totalDue ?? bill.minDue ?? amount ?? 0.0;
      if (total <= 0) return null;

      final cycleDate = bill.statementEnd ?? bill.dueDate ?? msgDate; // prefer cycle anchors
      final billId = _billDocId(bank: bank, last4: last4, msgDate: cycleDate);

      final billRef = FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('bill_reminders').doc(billId);

      // upsert bill reminder
      await billRef.set({
        'kind': 'credit_card_bill',
        'issuerBank': bank,
        'cardLast4': last4,
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
          bank: bank, amount: total, time: msgDate, type: 'debit', last4: last4,
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
            'cardLast4': last4,
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

      _log('WRITE/UPSERT CC BillReminder total=$total bank=${bank ?? "-"} last4=${last4 ?? "-"}');
      return msgDate;
    }


    // Otherwise, proceed with normal debit/credit
    final direction = _inferDirection(combined); // 'debit' | 'credit' | null
    if (direction == null) return null;
    if (amount == null || amount <= 0) return null;

    // Merchant extraction & normalization (initial)
    final merchantRaw = _guessMerchantSmart(combined) ?? upiSender;
    var merchantNorm = MerchantAlias.normalizeFromContext(
      raw: merchantRaw,
      upiVpa: upiVpa,
      emailDomain: emailDomain,
    );
    var merchantKey = (merchantNorm.isNotEmpty
            ? merchantNorm
            : (emailDomain ?? last4 ?? bank ?? 'UNKNOWN'))
        .toUpperCase();

    // ===== LLM-FIRST categorization =====
    final preview = _preview(_maskSensitive(combined));
    String finalCategory = 'Other';
    String finalSubcategory = '';
    double finalConfidence = 0.0;
    String categorySource = 'llm';
    final Set<String> labelSet = <String>{};

    bool hasSmartCategory = false;

    final overrideCat = await UserOverrides.getCategoryForMerchant(userId, merchantKey);
    if (overrideCat != null && overrideCat.isNotEmpty) {
      finalCategory = overrideCat;
      finalConfidence = 1.0;
      categorySource = 'user_override';
      hasSmartCategory = true;
    }

    if (!hasSmartCategory && AiConfig.llmOn) {
      try {
        final labels = await TxExtractor.labelUnknown([
          TxRaw(
            amount: amount,
            merchant: merchantNorm.isNotEmpty
                ? merchantNorm
                : (merchantRaw ?? 'MERCHANT'),
            desc: preview,
            date: msgDate.toIso8601String(),
          )
        ]);

        if (labels.isNotEmpty) {
          final l = labels.first;
          if (l.category.isNotEmpty) {
            finalCategory = l.category;
            finalConfidence = l.confidence;
            hasSmartCategory = true;
            categorySource = 'llm';
          }
          if (l.subcategory.isNotEmpty) {
            finalSubcategory = l.subcategory;
          }
          if (l.labels.isNotEmpty) {
            labelSet.addAll(l.labels);
          }
          if (l.merchantNorm.isNotEmpty) {
            merchantNorm = l.merchantNorm;
            merchantKey = merchantNorm.toUpperCase();
          }
        }
      } catch (e) {
        _log('LLM error: $e');
      }
    }

    // Fallback to rules only if we still don't have a category
    if (!hasSmartCategory) {
      categorySource = 'rules';
      try {
        final cat = CategoryRules.categorizeMerchant(combined, merchantKey);
        finalCategory = cat.category;
        finalSubcategory = cat.subcategory;
        finalConfidence = cat.confidence;
        labelSet.addAll(cat.tags);
        hasSmartCategory = true;
      } catch (_) {}
    }

    // txKey + claim for idempotency
    final key = buildTxKey(
      bank: bank,
      amount: amount,
      time: msgDate,
      type: direction,
      last4: last4,
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
      if (last4 != null) 'last4': last4,
      if (amountFx != null) 'fxOriginal': amountFx,
      if (fees.isNotEmpty) 'feesDetected': fees,
      'instrument': instrument,
    };

    String? existingDocId;
    if (RECONCILE_POLICY != ReconcilePolicy.off) {
      existingDocId = await CrossSourceReconcile.maybeMerge(
        userId: userId,
        direction: direction,
        amount: amount,
        timestamp: msgDate,
        cardLast4: last4,
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


    final note = _cleanNoteSimple(combined);
    final currency = (amountFx?['currency'] as String?) ?? 'INR';
    final isIntlResolved = isIntl || (amountFx != null && currency.toUpperCase() != 'INR');
    final counterparty = _deriveCounterparty(
      merchantNorm: merchantNorm,
      upiVpa: upiVpa,
      last4: last4,
      bank: bank,
      domain: emailDomain,
    );
    final cptyType = _deriveCounterpartyType(
      merchantNorm: merchantNorm,
      upiVpa: upiVpa,
      instrument: instrument,
      direction: direction,
    );
    final tags = _buildTags(
      instrument: instrument,
      isIntl: isIntlResolved,
      hasFees: fees.isNotEmpty,
      extra: _extraTagsFromText(combined),
    );

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
        cardLast4: last4,
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
      if (_looksLikeCardBillPayment(combined, bank: bank, last4: last4)) {
        await _maybeAttachToCardBillPayment(
          userId: userId,
          amount: amount,
          paidAt: msgDate,
          bank: bank,
          last4: last4,
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

  String? _extractCardLast4(String text) {
    final re = RegExp(
      r'(?:ending(?:\s*in)?|xx+|x{2,}|XXXX|XX|last\s*digits|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})',
      caseSensitive: false,
    );
    return re.firstMatch(text)?.group(1);
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
    // strip card type tokens so "credit" inside "credit card" doesn't influence direction
    final cleaned = body
        .replaceAll(RegExp(r'\bcredit\s+card\b', caseSensitive: false), '')
        .replaceAll(RegExp(r'\bdebit\s+card\b', caseSensitive: false), '')
        .toLowerCase();

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
    for (final k in known) { if (t.contains(k)) return k; }

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
    if (RegExp(r'\bUPI\b').hasMatch(t) || t.contains('VPA')) return 'UPI';
    if (RegExp(r'\bIMPS\b').hasMatch(t)) return 'IMPS';
    if (RegExp(r'\bNEFT\b').hasMatch(t)) return 'NEFT';
    if (RegExp(r'\bRTGS\b').hasMatch(t)) return 'RTGS';
    if (RegExp(r'\bATM\b').hasMatch(t)) return 'ATM';
    if (RegExp(r'\bPOS\b').hasMatch(t)) return 'POS';
    if (RegExp(r'\bDEBIT CARD\b').hasMatch(t) || RegExp(r'\bDC\b').hasMatch(t)) return 'Debit Card';
    if (RegExp(r'\bCREDIT CARD\b').hasMatch(t) || RegExp(r'\bCC\b').hasMatch(t)) return 'Credit Card';
    if (RegExp(r'WALLET|PAYTM WALLET|AMAZON PAY', caseSensitive: false).hasMatch(text)) return 'Wallet';
    if (RegExp(r'NETBANKING|NET BANKING', caseSensitive: false).hasMatch(text)) return 'NetBanking';
    if (RegExp(r'\bRECHARGE\b|\bDTH\b|\bPREPAID\b', caseSensitive: false).hasMatch(text)) return 'Recharge';
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
    required String? upiVpa,
    required String? last4,
    required String? bank,
    required String? domain,
  }) {
    if (merchantNorm.isNotEmpty) return merchantNorm;
    if (upiVpa != null && upiVpa.trim().isNotEmpty) return upiVpa.trim().toUpperCase();
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
    if (RegExp(r'\bcharge|surcharge|penalty|late fee\b').hasMatch(t)) out.add('charges');
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
