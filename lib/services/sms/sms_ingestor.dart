// lib/services/sms/sms_ingestor.dart
import 'dart:collection';

import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:telephony/telephony.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../expense_service.dart';
import '../income_service.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';

import '../../config/app_config.dart';
import '../ai/tx_extractor.dart';

import 'sms_permission_helper.dart';
import '../ingest_index_service.dart';
import '../ingest_filters.dart'; // guessBankFromSms (permissive) + helpers
import '../tx_key.dart';
import '../ingest_state_service.dart';
import '../ingest_job_queue.dart';

import '../categorization/category_rules.dart';
import '../user_overrides.dart';
import '../recurring/recurring_engine.dart';

// Fuzzy cross-source reconciliation (SMS ↔ Gmail, etc.)
import '../ingest/cross_source_reconcile.dart';
// Merchant alias normalization (collapse gateway descriptors)
import '../merchants/merchant_alias_service.dart';

// Merge policy shared with Gmail ingestion for consistent behavior.
enum ReconcilePolicy { off, mergeEnrich, mergeSilent }

class SmsIngestor {
  SmsIngestor._();
  static final SmsIngestor instance = SmsIngestor._();


  // ── Behavior toggles ────────────────────────────────────────────────────────
  static const bool USE_SERVICE_WRITES = false;  // write via Firestore by default
  static const bool AUTO_POST_TXNS = true;       // create expenses/incomes immediately
  static const bool WRITE_BILL_AS_EXPENSE = false; // keep false to avoid double-counting
  static const int INITIAL_HISTORY_DAYS = 120;
  static const ReconcilePolicy RECONCILE_POLICY = ReconcilePolicy.mergeEnrich;
  String _billDocId({
    required String? bank,
    required String? last4,
    required DateTime anchor,
  }) {
    final y = anchor.year;
    final m = anchor.month.toString().padLeft(2, '0');
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

  String _maskSensitive(String s) {
    var t = s;
    // mask long digit runs (cards/accounts), keep last4
    t = t.replaceAllMapped(
      RegExp(r'\b(\d{4})\d{4,10}(\d{4})\b'),
          (m) => '**** **** **** ${m.group(2)}',
    );
    // redact OTP lines
    t = t.replaceAll(RegExp(r'\b(OTP|ONE[-\s]?TIME\s*PASSWORD)\b[^\n]*', caseSensitive: false), '[REDACTED OTP]');
    return t;
  }

  String _cap(String s, [int max = 4000]) => s.length <= max ? s : s.substring(0, max) + '…';

  bool _looksLikeCardBillPayment(String text, {String? bank, String? last4}) {
    final u = text.toUpperCase();
    final payCue = RegExp(r'(CARD\s*PAYMENT|PAYMENT\s*RECEIVED|THANK YOU.*PAYING|BILL\s*PAYMENT)').hasMatch(u);
    final ccCue  = u.contains('CREDIT CARD') || u.contains('CC');
    final last4Hit = (last4 != null) && RegExp(r'\b' + RegExp.escape(last4) + r'\b').hasMatch(u);
    final bankHit  = (bank != null) && u.contains(bank.toUpperCase());
    return payCue && (last4Hit || bankHit || ccCue);
  }



  // Testing: pull a chunk of inbox regardless of cutoff
  static const bool TEST_MODE = true;
  static const int TEST_BACKFILL_DAYS = 100;
  static const int TEST_MAX_MSGBATCH = 4000;
  // Add this inside class SmsIngestor { ... }

// Delegate to shared filter helper (with safe fallback)
  bool _looksLikeOtpOnly(String body) {
    try {
      // uses looksLikeOtpOnly from lib/services/ingest_filters.dart
      return looksLikeOtpOnly(body);
    } catch (_) {
      final lower = body.toLowerCase();
      if (!lower.contains('otp')) return false;
      final hasTxnVerb = RegExp(
        r'\b(debit(?:ed)?|credit(?:ed)?|received|rcvd|deposit(?:ed)?|spent|purchase|paid|payment|withdrawn|transfer(?:red)?|txn|transaction|due|statement)\b',
        caseSensitive: false,
      ).hasMatch(lower);
      return !hasTxnVerb;
    }
  }


  // debug logs
  static const bool _DEBUG_INGEST = true;
  void _log(String s) { if (_DEBUG_INGEST) print('[SmsIngestor] $s'); }

  Telephony? _telephony;
  final ExpenseService _expense = ExpenseService();
  final IncomeService _income = IncomeService();
  final IngestIndexService _index = IngestIndexService();

  bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Telephony? _ensureTelephony() {
    if (!_isAndroid) return null;
    return _telephony ??= Telephony.instance;
  }

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
    // Warm alias overrides (non-blocking); safe to ignore returned Future.
    MerchantAlias.warmFromRemoteOnce();
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
    if (!_isAndroid) {
      _log('skip SMS backfill (not Android)');
      return;
    }
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) {
      _log('no SMS permission; skipping backfill');
      return;
    }

    final telephony = _ensureTelephony();
    if (telephony == null) {
      _log('telephony unavailable; skipping backfill');
      return;
    }

    final now = DateTime.now();
    final since = now.subtract(Duration(days: days));

    final msgs = await telephony.getInboxSms(
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

  Future<void> _maybeAttachToCardBillPayment({
    required String userPhone,
    required double amount,
    required DateTime paidAt,
    required String? bank,
    required String? last4,
    required DocumentReference txRef,
    required Map<String, dynamic> sourceMeta,
  }) async {
    String? bankLocal = bank;
    String? last4Local = last4;

    if (bankLocal == null && last4Local == null) {
      final raw = (sourceMeta['rawPreview'] as String?) ?? '';
      final guess4 = _extractCardLast4(raw);
      if (guess4 != null) last4Local = guess4;
    }
    if (bankLocal == null && last4Local == null) return;

    Query billQuery = FirebaseFirestore.instance
        .collection('users').doc(userPhone)
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

    _log('LINKED payment ${txRef.id} → bill ${d.id} (nowPaid=$nowPaid, status=$status)');
  }


  Future<void> initialBackfill({
    required String userPhone,
    int newerThanDays = INITIAL_HISTORY_DAYS,
  }) async {
    if (!_isAndroid) {
      _log('skip SMS backfill (not Android)');
      return;
    }
    if (TEST_MODE) {
      return backfillLastNDaysForTesting(userPhone: userPhone, days: TEST_BACKFILL_DAYS);
    }

    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final telephony = _ensureTelephony();
    if (telephony == null) return;

    final state = await IngestStateService.instance.ensureCutoff(userPhone);
    final now = DateTime.now();
    final deviceCutoff = now.subtract(Duration(days: newerThanDays));

    final msgs = await telephony.getInboxSms(
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
    if (!_isAndroid) return;
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final telephony = _ensureTelephony();
    if (telephony == null) return;

    try {
      telephony.listenIncomingSms(
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
    if (!_isAndroid) {
      _log('skip SMS sync (not Android)');
      return;
    }
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final telephony = _ensureTelephony();
    if (telephony == null) return;

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
        since = now.subtract(Duration(days: INITIAL_HISTORY_DAYS));
      }
    } catch (_) {
      since = now.subtract(Duration(days: INITIAL_HISTORY_DAYS));
    }

    final msgs = await telephony.getInboxSms(
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

    final masked = _maskSensitive(body);
    final preview = _preview(masked);
    final rawCapped = _cap(masked);

    _log('incoming ${ts.toIso8601String()} ${address ?? "?"}: ${_oneLine(body)}');

    // Pre-extract common signals
    final bank = _guessIssuerBank(address: address, body: body);
    final last4 = _extractCardLast4(body);
    final upiVpa = _extractUpiVpa(body);
    final instrument = _inferInstrument(body);
    final network = _inferCardNetwork(body);
    final isIntl = _looksInternational(body);
    final fx = _extractFx(body); // {"currency": "USD", "amount": 23.6}
    final fees = _extractFees(body); // {"convenience": 10.0, "gst": 1.8, ...}

    // Card bill detection (statement/due) → write a bill_reminder (not an expense)
    final bill = _extractCardBillInfo(body);
    if (bill != null) {
      final total = bill.totalDue ?? bill.minDue ?? _extractAmountInr(body) ?? 0.0;
      if (total > 0) {
        // use statementEnd or dueDate as cycle anchor for deterministic bill id
        final anchor = bill.statementEnd ?? bill.dueDate ?? ts;
        final billId = _billDocId(bank: bank, last4: last4, anchor: anchor);

        final billRef = FirebaseFirestore.instance
            .collection('users').doc(userPhone)
            .collection('bill_reminders').doc(billId);

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
          'amountPaid': FieldValue.increment(0),
          'linkedPaymentIds': FieldValue.arrayUnion([]),
          'updatedAt': Timestamp.now(),
          'merchantKey': (bank ?? 'CREDIT CARD').toUpperCase(),
        }, SetOptions(merge: true));

        await billRef.set({
          'sourceRecord': {
            'sms': {
              'at': Timestamp.fromDate(ts),
              'rawPreview': _preview(body),
              'raw': _cap(_maskSensitive(body)),
              if (address != null) 'address': address,
              'when': FieldValue.serverTimestamp(),
            }
          }
        }, SetOptions(merge: true));

        // Optional: legacy expense write (hidden from analytics) for backward-compat UI
        if (WRITE_BILL_AS_EXPENSE) {
          final key = buildTxKey(
            bank: bank, amount: total, time: ts, type: 'debit', last4: last4,
          );
          final claimed = await _index.claim(userPhone, key, source: 'sms').catchError((_) => false);
          if (claimed == true) {
            final docId = _docIdFromKey(key);
            final expRef = FirebaseFirestore.instance
                .collection('users').doc(userPhone)
                .collection('expenses').doc(docId);
            await expRef.set({
              'type': 'Credit Card Bill',
              'amount': total,
              'note': _cleanNoteSimple(body),
              'date': Timestamp.fromDate(ts),
              'payerId': userPhone,
              'cardLast4': last4,
              'cardType': 'Credit Card',
              'issuerBank': bank,
              'instrument': 'Credit Card',
              'instrumentNetwork': network,
              'counterparty': (bank ?? 'CREDIT CARD').toUpperCase(),
              'counterpartyType': 'CARD_BILL',
              'isBill': true,
              'excludedFromSpending': true,
              'tags': ['credit_card_bill','bill'],
              'txKey': key,
              'ingestSources': FieldValue.arrayUnion(['sms']),
              'sourceRecord': {
                'type': 'sms',
                'rawPreview': _preview(body),
              },
            }, SetOptions(merge: true));
          }
        }

        _log('UPSERT BillReminder(SMS) total=$total bank=${bank ?? "-"} last4=${last4 ?? "-"} id=$billId');
        return;
      }
    }


    // Regular debit/credit detection
    final direction = _inferDirection(body); // 'debit' | 'credit' | null
    // Minimal parsing: amount (₹ or FX)
    final amountInr = fx == null ? _extractAmountInr(body) : null;
    final amount = amountInr ?? fx?['amount'] as double?;
    if (amount == null || amount <= 0) {
      _log('no valid amount; skip');
      return;
    }
    if (direction == null) {
      _log('no clear direction; skip');
      return;
    }

    // Merchant/Counterparty (smart + alias normalize)
    final merchantRaw = _guessMerchantSmart(body);
    var merchantNorm = MerchantAlias.normalizeFromContext(
      raw: merchantRaw,
      upiVpa: upiVpa,
      smsAddress: address,
    );
    var merchantKey = (merchantNorm.isNotEmpty
        ? merchantNorm
        : (last4 ?? bank ?? 'UNKNOWN'))
        .toUpperCase();

    // Stable key + per-source idempotency
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

    // Cutoff (ignored in TEST_MODE)
    final st = ingestState ?? await IngestStateService.instance.get(userPhone);
    final cutoff = _extractCutoff(st);
    final isAfterCutoff = TEST_MODE ? true : (cutoff == null ? true : ts.isAfter(cutoff));
    if (!isAfterCutoff) {
      _log('before cutoff — skip');
      return;
    }

    // ===== LLM-FIRST categorization =====
    String finalCategory = 'Other';
    String finalSubcategory = '';
    double finalConfidence = 0.0;
    String categorySource = 'llm';
    final Set<String> labelSet = <String>{};

    bool hasSmartCategory = false;

    final overrideCat = await UserOverrides.getCategoryForMerchant(userPhone, merchantKey);
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
            date: ts.toIso8601String(),
          ),
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

    if (!hasSmartCategory) {
      categorySource = 'rules';
      try {
        final cat = CategoryRules.categorizeMerchant(body, merchantKey);
        finalCategory = cat.category;
        finalSubcategory = cat.subcategory;
        finalConfidence = cat.confidence;
        labelSet.addAll(cat.tags);
        hasSmartCategory = true;
      } catch (_) {}
    }

    final counterparty = _deriveCounterparty(
      merchantNorm: merchantNorm,
      upiVpa: upiVpa,
      last4: last4,
      bank: bank,
      address: address,
    );
    final counterpartyType = _deriveCounterpartyType(
      merchantNorm: merchantNorm,
      upiVpa: upiVpa,
      instrument: instrument,
      direction: direction,
    );

    // Source record with enrichment
    final sourceMeta = {
      'type': 'sms',
      'raw': rawCapped,
      'rawPreview': preview,
      'at': Timestamp.fromDate(ts),
      if (address != null) 'address': address,
      if (merchantNorm.isNotEmpty) 'merchant': merchantNorm,
      if (bank != null) 'issuerBank': bank,
      if (upiVpa != null) 'upiVpa': upiVpa,
      if (network != null) 'network': network,
      if (last4 != null) 'last4': last4,
      'instrument': instrument,
      'txKey': key,
      'when': Timestamp.fromDate(DateTime.now()),
      if (fx != null) 'fxOriginal': fx,
      if (fees.isNotEmpty) 'feesDetected': fees,
    };

    // Cross-source reconcile (avoid duplicate if Gmail created it)
    String? existingDocId;
    if (RECONCILE_POLICY != ReconcilePolicy.off) {
      existingDocId = await CrossSourceReconcile.maybeMerge(
        userId: userPhone,
        direction: direction,
        amount: amount,
        timestamp: ts,
        cardLast4: last4,
        merchantKey: merchantKey,
        txKey: key,
        upiVpa: upiVpa,
        issuerBank: bank,
        instrument: instrument,
        network: network,
        amountTolerancePct: (fx != null || isIntl) ? 2.0 : 0.5,
        newSourceMeta: sourceMeta,
      );
    }
    if (existingDocId != null) {
      if (RECONCILE_POLICY == ReconcilePolicy.mergeEnrich) {
        final col = direction == 'debit' ? 'expenses' : 'incomes';
        final ref = FirebaseFirestore.instance
            .collection('users').doc(userPhone)
            .collection(col).doc(existingDocId);

        await ref.set({
          'ingestSources': FieldValue.arrayUnion(['sms']),
          'sourceRecord.sms': {
            'at': Timestamp.fromDate(ts),
            'rawPreview': preview,
            if (address != null) 'address': address,
            'txKey': key,
            'when': Timestamp.fromDate(DateTime.now()),
          },
          'mergeHints': {
            'smsMatched': true,
            'smsTxKey': key,
          },
        }, SetOptions(merge: true));
      }

      _log('merge($direction) -> $existingDocId [policy: $RECONCILE_POLICY]');
      return;
    }

    // Build model and write
    final note = _cleanNoteSimple(body);
    final currency = (fx?['currency'] as String?) ?? 'INR';
    final isIntlResolved = isIntl || (fx != null && currency.toUpperCase() != 'INR');
    final tags = _buildTags(
      instrument: instrument,
      isIntl: isIntlResolved,
      hasFees: fees.isNotEmpty,
      extra: _extraTagsFromText(body),
    );

    if (direction == 'debit') {
      final expRef = FirebaseFirestore.instance
          .collection('users').doc(userPhone)
          .collection('expenses').doc(_docIdFromKey(key));

      final e = ExpenseItem(
        id: expRef.id,
        type: 'SMS Debit',
        amount: amount,
        note: note,
        date: ts,
        payerId: userPhone,
        cardLast4: last4,
        cardType: _isCard(instrument) ? (_isCreditCard(body) ? 'Credit Card' : 'Debit Card') : null,
        issuerBank: bank,
        instrument: instrument,
        instrumentNetwork: network,
        upiVpa: upiVpa,
        counterparty: counterparty,     // ✅ "Paid to OPENAI" when present
        counterpartyType: counterpartyType,
        isInternational: isIntlResolved,
        fx: fx,
        fees: fees.isNotEmpty ? fees : null,
        tags: tags,
      );

      if (USE_SERVICE_WRITES) {
        await _expense.addExpense(userPhone, e);
      } else {
        await expRef.set(e.toJson(), SetOptions(merge: true));
      }

      final labelsForDoc = labelSet.toList();
      final combinedTags = <String>{};
      combinedTags.addAll(e.tags ?? const []);
      combinedTags.addAll(labelSet);
      await expRef.set({
        'sourceRecord': sourceMeta,
        'merchantKey': merchantKey,
        if (merchantNorm.isNotEmpty) 'merchant': merchantNorm,
        'txKey': key, // flat for updaters
        'category': finalCategory,
        'subcategory': finalSubcategory,
        'categoryConfidence': finalConfidence,
        'categorySource': categorySource,
        'tags': combinedTags.toList(),
        'labels': labelsForDoc,
      }, SetOptions(merge: true));

      await expRef.set({
        'ingestSources': FieldValue.arrayUnion(['sms']),
      }, SetOptions(merge: true));

      try {
        await RecurringEngine.maybeAttachToSubscription(userPhone, expRef.id);
        await RecurringEngine.maybeAttachToLoan(userPhone, expRef.id);
        await RecurringEngine.markPaidIfInWindow(userPhone, expRef.id);
      } catch (_) {}

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
          docId: expRef.id,
          docCollection: 'expenses',
          docPath: 'users/$userPhone/expenses/${expRef.id}',
          enabled: true,
        );
      } catch (_) {}
      if (_looksLikeCardBillPayment(body, bank: bank, last4: last4)) {
        await _maybeAttachToCardBillPayment(
          userPhone: userPhone,
          amount: amount,
          paidAt: ts,
          bank: bank,
          last4: last4,
          txRef: expRef, // reuse existing reference
          sourceMeta: sourceMeta,
        );
      }



    } else {
      final incRef = FirebaseFirestore.instance
          .collection('users').doc(userPhone)
          .collection('incomes').doc(_docIdFromKey(key));

      final i = IncomeItem(
        id: incRef.id,
        type: 'SMS Credit',
        amount: amount,
        note: note,
        date: ts,
        source: 'SMS',
        issuerBank: bank,
        instrument: instrument,
        instrumentNetwork: network,
        upiVpa: upiVpa,
        counterparty: counterparty,      // "Received from"
        counterpartyType: counterpartyType,
        isInternational: isIntlResolved,
        fx: fx,
        fees: fees.isNotEmpty ? fees : null,
        tags: tags,
      );

      if (USE_SERVICE_WRITES) {
        await _income.addIncome(userPhone, i);
      } else {
        await incRef.set(i.toJson(), SetOptions(merge: true));
      }

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
        'ingestSources': FieldValue.arrayUnion(['sms']),
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
          docId: incRef.id,
          docCollection: 'incomes',
          docPath: 'users/$userPhone/incomes/${incRef.id}',
          enabled: true,
        );
      } catch (_) {}
    }

    _log('WRITE type=$direction amt=$amount key=$key inst=$instrument bank=${bank ?? "-"}');
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

  // Note cleaner
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
        if (v != null) return v;
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
      r'\b(debit(?:ed)?|spent|purchase|paid|payment|pos|upi(?:\s*payment)?|imps|neft|rtgs|withdrawn|withdrawal|atm|charge[ds]?|recharge(?:d)?|bill\s*paid|auto[-\s]?debit|autopay|nach|e-?mandate|mandate)\b',
      caseSensitive: false,
    ).hasMatch(lower);
    final credit = RegExp(
      r'\b(credit(?:ed)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    if ((debit || isDR) && !(credit || isCR)) return 'debit';
    if ((credit || isCR) && !(debit || isDR)) return 'credit';

    // both seen: pick first occurrence
    final dIdx = RegExp(r'debit|spent|purchase|paid|payment|dr|auto[-\s]?debit|autopay|nach|mandate', caseSensitive: false).firstMatch(lower)?.start ?? -1;
    final cIdx = RegExp(r'credit|received|rcvd|deposit|salary|refund|cr', caseSensitive: false).firstMatch(lower)?.start ?? -1;
    if (dIdx >= 0 && cIdx >= 0) return dIdx < cIdx ? 'debit' : 'credit';
    return null;
  }

  // merchant guess (smart) from SMS text (before alias normalize)
  String? _guessMerchantSmart(String body) {
    final t = body.toUpperCase();

    // explicit "Merchant/Payee:"
    final m0 = RegExp(r'\b(MERCHANT|PAYEE)\s*[:\-]\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m0 != null) {
      final v = m0.group(2)!.trim();
      if (v.isNotEmpty) return v;
    }

    // “for/towards/to/at <merchant>” near txn cue
    final m1 = RegExp(r'\b(TXN|TRANSACTION|PURCHASE|PAID|PAYMENT|AUTOPAY|AUTO[-\s]?DEBIT)\b[^A-Z0-9]{0,40}\b(FOR|TOWARDS|TO|AT)\b\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m1 != null) {
      final v = m1.group(3)!.trim();
      if (v.isNotEmpty) return v;
    }

    // known brands
    final known = <String>[
      'OPENAI','NETFLIX','AMAZON PRIME','PRIME VIDEO','SPOTIFY','YOUTUBE','GOOGLE *YOUTUBE',
      'APPLE.COM/BILL','APPLE','MICROSOFT','ADOBE','SWIGGY','ZOMATO','HOTSTAR','DISNEY+ HOTSTAR',
      'SONYLIV','AIRTEL','JIO','VI','HATHWAY','ACT FIBERNET','BOOKMYSHOW','BIGTREE','OLA','UBER',
      'IRCTC','REDBUS','AMAZON','FLIPKART','MEESHO','BLINKIT','ZEPTO'
    ];
    for (final k in known) { if (t.contains(k)) return k; }

    // “to/at <merchant>”
    final m2 = RegExp(r'\b(TO|AT)\b\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m2 != null) {
      final v = m2.group(2)!.trim();
      if (v.isNotEmpty) return v;
    }

    return null;
  }

  String? _extractCardLast4(String text) {
    final re = RegExp(
      r'(?:ending(?:\s*in)?|xx+|x{2,}|XXXX|XX|last\s*digits|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})',
      caseSensitive: false,
    );
    return re.firstMatch(text)?.group(1);
  }

  String? _extractUpiVpa(String text) {
    final re = RegExp(r'\b([a-zA-Z0-9.\-_]{2,})@([a-zA-Z]{2,})\b');
    return re.firstMatch(text)?.group(0);
  }

  bool _isCard(String? instrument) =>
      instrument != null && {
        'CREDIT CARD','DEBIT CARD','CARD','ATM','POS'
      }.contains(instrument.toUpperCase());

  bool _isCreditCard(String body) {
    final t = body.toLowerCase();
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
    // heuristics: mentions of "international", "foreign", or non-INR currency seen elsewhere
    return t.contains('international') || t.contains('foreign');
  }

  Map<String, double> _extractFees(String text) {
    final Map<String, double> out = {};
    double? _firstAmountAfter(RegExp pat) {
      final t = text;
      final m = pat.firstMatch(t);
      if (m == null) return null;
      // find ₹/INR/Rs amount after the match
      final after = t.substring(m.end);
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

  // Credit Card Bill extraction (Total Due, Min Due, Due Date, Statement period)
  _BillInfo? _extractCardBillInfo(String text) {
    final t = text.toUpperCase();
    if (!(t.contains('CREDIT CARD') || t.contains('CC')))
      return null;

    // Must have at least one of total due/min due/due date/bill/statement
    final hasCue = RegExp(r'(TOTAL\s*(AMT|AMOUNT)?\s*DUE|MIN(IM)?UM\s*(AMT|AMOUNT)?\s*DUE|DUE\s*DATE|BILL\s*DUE|STATEMENT)', caseSensitive: false)
        .hasMatch(text);
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
          caseSensitive: false);
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

    // Statement period (optional): "Statement 12 Aug to 11 Sep"
    DateTime? stStart;
    DateTime? stEnd;
    final period = RegExp(r'(STATEMENT\s*(PERIOD)?|BILL\s*CYCLE)[^0-9]*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{2,4})\s*(TO|-)\s*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{2,4})',
        caseSensitive: false).firstMatch(text);
    if (period != null) {
      stStart = _parseLooseDate(period.group(3)!);
      stEnd = _parseLooseDate(period.group(5)!);
    }

    if (total == null && minDue == null && dueDate == null) return null;
    return _BillInfo(totalDue: total, minDue: minDue, dueDate: dueDate, statementStart: stStart, statementEnd: stEnd);
  }

  DateTime? _parseLooseDate(String s) {
    try {
      // Try common formats: dd-MM-yyyy, dd/MM/yyyy, d MMM yyyy
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

  String? _guessIssuerBank({String? address, required String body}) {
    // Prefer existing helper; if null try extra cues
    final g = guessBankFromSms(address: address, body: body);
    if (g != null) return g;
    final t = (address ?? body).toUpperCase();
    if (t.contains('HDFC')) return 'HDFC';
    if (t.contains('ICICI')) return 'ICICI';
    if (t.contains('SBI')) return 'SBI';
    if (t.contains('AXIS')) return 'AXIS';
    if (t.contains('KOTAK')) return 'KOTAK';
    if (t.contains('YES')) return 'YES';
    if (t.contains('IDFC')) return 'IDFC';
    if (t.contains('BOB') || t.contains('BANK OF BARODA')) return 'BOB';
    return null;
  }

  String _deriveCounterparty({
    required String merchantNorm,
    required String? upiVpa,
    required String? last4,
    required String? bank,
    required String? address,
  }) {
    if (merchantNorm.isNotEmpty) return merchantNorm;
    if (upiVpa != null && upiVpa.trim().isNotEmpty) return upiVpa.trim().toUpperCase();
    if (last4 != null && last4.isNotEmpty) return 'CARD $last4';
    if (bank != null) return bank;
    return (address ?? 'UNKNOWN').toUpperCase();
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
    // de-dup
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
