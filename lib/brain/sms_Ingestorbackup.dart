// lib/services/sms/sms_ingestor.dart
import 'package:telephony/telephony.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../expense_service.dart';
import '../income_service.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';

import 'sms_permission_helper.dart';
import '../ingest_index_service.dart';
import '../ingest_filters.dart';
import '../tx_key.dart';

// 🧠 Fiinnny Brain
import '../../brain/brain_enricher_service.dart';

/// Central SMS ingestion pipeline:
/// - backfill (N days)
/// - realtime listen
/// - delta sync (last N hours)
/// - promo/OTP filtering
/// - cross-source dedupe (SMS vs Gmail) using Firestore
/// - 👇 NEW: brain enrichment (category, tags, confidence, brainMeta)
class SmsIngestor {
  SmsIngestor._();
  static final SmsIngestor instance = SmsIngestor._();

  // ====== Behavior toggles ===================================================
  // Recommended for reliability today: write directly here, enrich, skip services.
  // If your ExpenseService/IncomeService MUST run for side-effects, flip BOTH:
  //   USE_DIRECT_WRITES = false; USE_SERVICE_WRITES = true;
  // And make sure your services RESPECT the provided model.id (write to doc(id)).
  static const bool USE_DIRECT_WRITES = true;
  static const bool USE_SERVICE_WRITES = false; // set true only if services use provided ids

  final Telephony _telephony = Telephony.instance;
  final ExpenseService _expense = ExpenseService();
  final IncomeService _income = IncomeService();
  final IngestIndexService _index = IngestIndexService();

  /// Optional init in case you want to inject services later
  void init({
    ExpenseService? expenseService,
    IncomeService? incomeService,
    // kept for signature compatibility
    dynamic index,
  }) {
    // If you ever pass custom services, wire them here.
    // Currently we use our own singletons above.
  }

  /// One-time historical fetch from the device inbox.
  Future<void> initialBackfill({
    required String userPhone,
    int newerThanDays = 1000,
  }) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final now = DateTime.now();
    final cutoff = now.subtract(Duration(days: newerThanDays));

    final msgs = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    for (final m in msgs) {
      final body = m.body ?? '';
      final ts = DateTime.fromMillisecondsSinceEpoch(
        m.date ?? now.millisecondsSinceEpoch,
      );
      if (ts.isBefore(cutoff)) break;

      await _handleOne(
        userPhone: userPhone,
        body: body,
        ts: ts,
        address: m.address, // may be null
      );
    }
  }

  /// Start realtime listening. Works foreground by default; background requires
  /// correct manifest setup for the telephony plugin.
  Future<void> startRealtime({required String userPhone}) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    _telephony.listenIncomingSms(
      onNewMessage: (SmsMessage m) async {
        final body = m.body ?? '';
        final ts = DateTime.fromMillisecondsSinceEpoch(
          m.date ?? DateTime.now().millisecondsSinceEpoch,
        );
        await _handleOne(
          userPhone: userPhone,
          body: body,
          ts: ts,
          address: m.address,
        );
      },
      listenInBackground: true,
    );
  }

  /// Quick catch-up (e.g., on pull-to-refresh or app resume)
  Future<void> syncDelta({
    required String userPhone,
    int lookbackHours = 48,
  }) async {
    final granted = await SmsPermissionHelper.hasPermissions();
    if (!granted) return;

    final since = DateTime.now().subtract(Duration(hours: lookbackHours));

    final msgs = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    for (final m in msgs) {
      final ts = DateTime.fromMillisecondsSinceEpoch(
        m.date ?? DateTime.now().millisecondsSinceEpoch,
      );
      if (ts.isBefore(since)) break;

      await _handleOne(
        userPhone: userPhone,
        body: m.body ?? '',
        ts: ts,
        address: m.address,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Core parsing + routing
  // --------------------------------------------------------------------------
  Future<void> _handleOne({
    required String userPhone,
    required String body,
    required DateTime ts,
    String? address,
  }) async {
    // 1) Filter obvious promos/OTP/non-bank
    if (isLikelyPromo(body) || _looksLikeOtpOnly(body)) return;

    // 2) Extract amount
    final amount = _extractAmount(body);
    if (amount == null) return;

    // 3) Determine direction (debit vs credit)
    final lower = body.toLowerCase();
    final isDebit = RegExp(
      r'\b(debited|spent|purchase|paid|withdrawn|upi payment|imps|neft|rtgs|sent)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    final isCredit = RegExp(
      r'\b(credited|received|deposit|salary|cashback|refund|interest)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    if (isDebit == isCredit) {
      // ambiguous or none — skip
      return;
    }

    // 4) Try to identify bank & last4 (best-effort)
    final bank = guessBankFromSms(address: address, body: body);

    String? last4;
    final m4 = RegExp(
      r'(?:XX|x{2,}|ending|acct|a/c)[^\d]*(\d{4})',
      caseSensitive: false,
    ).firstMatch(body);
    if (m4 != null) last4 = m4.group(1);

    // 5) Build a stable cross-source key (so Gmail/SMS won’t double-insert)
    final type = isDebit ? 'debit' : 'credit';
    final key = buildTxKey(
      bank: bank,
      amount: amount,
      time: ts,
      type: type,
      last4: last4,
    );

    // 6) Claim it atomically. If this returns false, we already stored it.
    final ok = await _index.claim(userPhone, key, source: 'sms');
    if (!ok) return;

    // 7) Persist + Brain enrichment
    try {
      if (isDebit) {
        final expRef = FirebaseFirestore.instance
            .collection('users').doc(userPhone)
            .collection('expenses').doc(); // pre-generate id

        final e = ExpenseItem(
          id: expRef.id,
          type: 'SMS Debit',
          amount: amount,
          note: body,
          date: ts,
          payerId: userPhone,
          cardLast4: last4,
          bankLogo: null,
          // isBill/label/category left for brain
        );

        if (USE_DIRECT_WRITES) {
          // a) write raw
          await expRef.set(e.toJson(), SetOptions(merge: true));
          // b) brain hook
          final updates = BrainEnricherService().buildExpenseBrainUpdate(e);
          await expRef.set(updates, SetOptions(merge: true));
        }

        if (USE_SERVICE_WRITES) {
          // Requires: ExpenseService.addExpense must respect e.id (write to doc(e.id))
          await _expense.addExpense(userPhone, e);
          // Merge brain fields again in case service overwrote anything
          final updates = BrainEnricherService().buildExpenseBrainUpdate(e);
          await expRef.set(updates, SetOptions(merge: true));
        }
      } else {
        final incRef = FirebaseFirestore.instance
            .collection('users').doc(userPhone)
            .collection('incomes').doc();

        final i = IncomeItem(
          id: incRef.id,
          type: 'SMS Credit',
          amount: amount,
          note: body,
          date: ts,
          source: 'SMS',
          // label/category left for brain
        );

        if (USE_DIRECT_WRITES) {
          await incRef.set(i.toJson(), SetOptions(merge: true));
          final incUpdates = BrainEnricherService().buildIncomeBrainUpdate(i);
          await incRef.set(incUpdates, SetOptions(merge: true));
        }

        if (USE_SERVICE_WRITES) {
          // Requires: IncomeService.addIncome must respect i.id
          await _income.addIncome(userPhone, i);
          final incUpdates = BrainEnricherService().buildIncomeBrainUpdate(i);
          await incRef.set(incUpdates, SetOptions(merge: true));
        }
      }
    } catch (e, st) {
      // If the write fails for any reason, we still keep the claim to avoid loops.
      // Optionally, roll back claim in _index if you want strict consistency.
      // print('sms_ingestor: write/enrich failed: $e\n$st');
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /// Handles: "INR 1,250.00", "₹500", "Rs.51.00", "51.00 debited",
  /// "debited by 300.00", "paid for 250", etc.
  double? _extractAmount(String text) {
    final patterns = <RegExp>[
      // Currency BEFORE amount
      RegExp(r'(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)', caseSensitive: false),

      // Amount BEFORE verb
      RegExp(
        r'([\d,]+(?:\.\d{1,2})?)\s*(?:debited|credited|withdrawn|spent|sent|paid|purchase)',
        caseSensitive: false,
      ),

      // by/for/of amount
      RegExp(r'(?:by|for|of)\s+([\d,]+(?:\.\d{1,2})?)', caseSensitive: false),
    ];

    for (final re in patterns) {
      final m = re.firstMatch(text);
      if (m != null) {
        final raw = (m.group(1) ?? '').replaceAll(',', '');
        final val = double.tryParse(raw);
        if (val != null) return val;
      }
    }
    return null;
  }

  bool _looksLikeOtpOnly(String body) {
    final lower = body.toLowerCase();
    if (RegExp(r'\botp\b', caseSensitive: false).hasMatch(lower)) {
      // If it also has clear txn verbs, keep it; else treat as OTP-only
      final hasTxnVerb = RegExp(
        r'\b(debited|credited|withdrawn|spent|sent|purchase|paid|transfer)\b',
        caseSensitive: false,
      ).hasMatch(lower);
      if (!hasTxnVerb) return true;
    }
    return false;
  }
}
