// lib/services/recurring/recurring_engine.dart
import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';

import '../categorization/category_rules.dart';
import '../expense_service.dart';
import '../income_service.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../ingest_filters.dart';
import '../merchants/merchant_alias_service.dart';

class PeriodGuess {
  final String
      period; // 'monthly' | 'quarterly' | 'annual' | 'weekly' | 'unknown'
  final double confidence; // 0..1
  final int days; // canonical day span when known, else -1
  const PeriodGuess(this.period, this.confidence, this.days);
}

class SubscriptionEvidence {
  final String brand;
  final String merchantKey;
  final String instrument;
  final String? last4;
  final String? network;
  final List<DateTime> paidAt;
  final List<double> amounts;
  bool hasAutopayCue;
  bool hasSubCues;
  SubscriptionEvidence({
    required this.brand,
    required this.merchantKey,
    required this.instrument,
    required this.last4,
    required this.network,
    required this.paidAt,
    required this.amounts,
    this.hasAutopayCue = false,
    this.hasSubCues = false,
  });
}

String _normInstrument(String? raw) {
  final u = (raw ?? '').toUpperCase().trim();
  if (u.contains('CREDIT')) return 'CREDIT CARD';
  if (u.contains('DEBIT')) return 'DEBIT CARD';
  if (u.contains('UPI')) return 'UPI';
  if (u.contains('NET')) return 'NETBANKING';
  if (u.contains('IMPS')) return 'IMPS';
  if (u.contains('NEFT')) return 'NEFT';
  if (u.contains('RTGS')) return 'RTGS';
  if (u.contains('ATM')) return 'ATM';
  if (u.contains('POS')) return 'POS';
  if (u.contains('WALLET')) return 'WALLET';
  if (u.isEmpty) return 'ACCOUNT';
  return u;
}

String? _normalizeLast4(String? raw) {
  if (raw == null) return null;
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.length < 4) return null;
  return digits.substring(digits.length - 4);
}

String _readMerchantFromExpense(ExpenseItem e) {
  try {
    final m = (e.toJson()['merchant'] ?? e.label ?? e.category ?? '')
        .toString()
        .trim();
    if (m.isNotEmpty) return m;
  } catch (_) {}
  return (e.counterparty ?? '').toString().trim();
}

String _readMerchantKeyFromExpense(ExpenseItem e) {
  try {
    final mk = (e.toJson()['merchantKey'] ?? '').toString().trim();
    if (mk.isNotEmpty) return mk.toUpperCase();
  } catch (_) {}
  final m = _readMerchantFromExpense(e);
  return m.isNotEmpty ? m.toUpperCase() : '';
}

String _readMerchantFromIncome(IncomeItem i) {
  try {
    final m = (i.toJson()['merchant'] ?? i.label ?? i.category ?? '')
        .toString()
        .trim();
    if (m.isNotEmpty) return m;
  } catch (_) {}
  return (i.counterparty ?? '').toString().trim();
}

String _readMerchantKeyFromIncome(IncomeItem i) {
  try {
    final mk = (i.toJson()['merchantKey'] ?? '').toString().trim();
    if (mk.isNotEmpty) return mk.toUpperCase();
  } catch (_) {}
  final m = _readMerchantFromIncome(i);
  return m.isNotEmpty ? m.toUpperCase() : '';
}

bool _tagsContain(List<String>? tags, String needle) {
  if (tags == null) return false;
  final lower = needle.toLowerCase();
  return tags.any((t) => t.toLowerCase() == lower);
}

PeriodGuess _inferPeriod(List<DateTime> dates) {
  if (dates.length < 2) return const PeriodGuess('unknown', 0.0, -1);
  final deltas = <int>[];
  for (var i = 1; i < dates.length; i++) {
    deltas.add(dates[i].difference(dates[i - 1]).inDays.abs());
  }

  double score(int target, int tolerance) {
    if (deltas.isEmpty) return 0.0;
    var ok = 0;
    for (final d in deltas) {
      if ((d - target).abs() <= tolerance) ok++;
    }
    return ok / deltas.length;
  }

  final monthly = score(30, 3);
  final quarterly = score(90, 6);
  final annual = score(365, 14);
  final weekly = score(7, 1);

  var best = monthly;
  var label = 'monthly';
  var days = 30;

  if (quarterly > best) {
    best = quarterly;
    label = 'quarterly';
    days = 90;
  }
  if (annual > best) {
    best = annual;
    label = 'annual';
    days = 365;
  }
  if (weekly > best) {
    best = weekly;
    label = 'weekly';
    days = 7;
  }

  if (best >= 0.6) {
    return PeriodGuess(label, best, days);
  }
  return const PeriodGuess('unknown', 0.0, -1);
}

double _median(List<double> values) {
  if (values.isEmpty) return 0.0;
  final sorted = [...values]..sort();
  final mid = sorted.length ~/ 2;
  if (sorted.length.isOdd) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

double _toleranceForBrand(String brand) {
  final b = brand.toUpperCase();
  if (['SPOTIFY', 'NETFLIX', 'HOTSTAR', 'YOUTUBE PREMIUM', 'PRIME VIDEO']
      .contains(b)) {
    return 0.15;
  }
  if (['AIRTEL', 'JIO', 'VI'].contains(b)) {
    return 0.20;
  }
  if (['ELECTRICITY', 'WATER', 'GAS'].contains(b)) {
    return 0.20;
  }
  if (['EMI', 'LOAN'].contains(b)) {
    return 0.02;
  }
  return 0.15;
}

List<SubscriptionEvidence> _collectEvidence(
  List<ExpenseItem> expenses,
  List<IncomeItem> incomes,
) {
  final map = <String, SubscriptionEvidence>{};

  void addExpense(ExpenseItem e) {
    if (e.amount <= 0) return;
    final primary = _readMerchantFromExpense(e).isNotEmpty
        ? _readMerchantFromExpense(e)
        : _readMerchantKeyFromExpense(e);
    final normalized = MerchantAlias.normalizeFromContext(
      raw: primary,
      upiVpa: e.upiVpa,
    );
    final fallback = MerchantAlias.normalize(primary);
    final brand = (normalized.isNotEmpty ? normalized : fallback).toUpperCase();
    final merchantKey = (_readMerchantKeyFromExpense(e).isNotEmpty
        ? _readMerchantKeyFromExpense(e)
        : brand.toUpperCase());
    final instrument = _normInstrument(e.instrument ?? e.cardType);
    final last4 = _normalizeLast4(e.cardLast4);
    final network = (e.instrumentNetwork ?? '').toUpperCase().trim();
    final hasAuto = hasAutopayCue(e.note) || _tagsContain(e.tags, 'autopay');
    final hasSub = looksSubscriptionContext(e.note) ||
        _tagsContain(e.tags, 'subscription');

    if (brand.isEmpty && merchantKey.isEmpty) return;

    final key = '$merchantKey|$instrument|${last4 ?? ''}|$network';
    final ev = map.putIfAbsent(
      key,
      () => SubscriptionEvidence(
        brand: brand.isNotEmpty ? brand : merchantKey,
        merchantKey: merchantKey.isNotEmpty ? merchantKey : brand,
        instrument: instrument,
        last4: last4,
        network: network.isEmpty ? null : network,
        paidAt: <DateTime>[],
        amounts: <double>[],
        hasAutopayCue: hasAuto,
        hasSubCues: hasSub,
      ),
    );

    ev.hasAutopayCue = ev.hasAutopayCue || hasAuto;
    ev.hasSubCues = ev.hasSubCues || hasSub;
    ev.paidAt.add(e.date);
    ev.amounts.add(e.amount);
  }

  for (final e in expenses) {
    addExpense(e);
  }

  // Incomes are rarely subscriptions; keep hook for future use if needed.
  void addIncome(IncomeItem i) {
    if (i.amount <= 0) return;
    final primary = _readMerchantFromIncome(i).isNotEmpty
        ? _readMerchantFromIncome(i)
        : _readMerchantKeyFromIncome(i);
    final normalized = MerchantAlias.normalizeFromContext(
      raw: primary,
      upiVpa: i.upiVpa,
    );
    final fallback = MerchantAlias.normalize(primary);
    final brand = (normalized.isNotEmpty ? normalized : fallback).toUpperCase();
    final merchantKey = (_readMerchantKeyFromIncome(i).isNotEmpty
        ? _readMerchantKeyFromIncome(i)
        : brand.toUpperCase());
    final instrument = _normInstrument(i.instrument);
    final last4 =
        null; // IncomeItem model has no cardLast4; ignore for recurring
    final network = (i.instrumentNetwork ?? '').toUpperCase().trim();

    if (brand.isEmpty && merchantKey.isEmpty) return;

    final key = '$merchantKey|$instrument|${last4 ?? ''}|$network';
    map.putIfAbsent(
      key,
      () => SubscriptionEvidence(
        brand: brand.isNotEmpty ? brand : merchantKey,
        merchantKey: merchantKey.isNotEmpty ? merchantKey : brand,
        instrument: instrument,
        last4: last4,
        network: network.isEmpty ? null : network,
        paidAt: <DateTime>[],
        amounts: <double>[],
      ),
    );
  }

  for (final i in incomes) {
    addIncome(i);
  }

  for (final ev in map.values) {
    final pairs = <MapEntry<DateTime, double>>[];
    for (var idx = 0; idx < ev.paidAt.length; idx++) {
      pairs.add(MapEntry(ev.paidAt[idx], ev.amounts[idx]));
    }
    pairs.sort((a, b) => a.key.compareTo(b.key));
    ev.paidAt
      ..clear()
      ..addAll(pairs.map((p) => p.key));
    ev.amounts
      ..clear()
      ..addAll(pairs.map((p) => p.value));
  }

  return map.values.toList();
}

/// RecurringEngine
/// - Keeps all previous behavior (subscriptions + loans)
/// - Adds:
///   1) SIP detector/attach (Mutual Fund auto-invests)
///   2) Credit-card trackers:
///      • When a "Credit Card Bill" expense is ingested, create/update a card doc
///      • Track statement period, due dates, min/total due
///      • Aggregate spend for credit-card transactions in the same cycle
/// - Never blocks ingest; all methods swallow errors and use merge-writes.
class RecurringEngine {
  static const _monthlyDays = 30;
  static const _yearlyDays = 365;

  // === PUBLIC API (kept for backward compatibility) ==========================

  /// Existing call site (from parsers). We keep semantics AND run new hooks:
  /// - Subscriptions
  /// - SIP attach (NEW)
  /// - Credit-card trackers (NEW)
  static Future<void> maybeAttachToSubscription(
      String userId, String expenseId) async {
    try {
      await _maybeUpdateCardTrackers(userId, expenseId); // NEW
    } catch (_) {}
    try {
      await _maybeAttachSip(userId, expenseId); // NEW
    } catch (_) {}
    try {
      await _maybeAttachSubscriptionClassic(
          userId, expenseId); // legacy behavior
    } catch (_) {}
  }

  /// Existing call site: rolls subscription window if a matching payment lands.
  static Future<void> markPaidIfInWindow(
      String userId, String expenseId) async {
    try {
      await _markSubscriptionPaidIfInWindow(userId, expenseId);
    } catch (_) {}
    // Also opportunistically aggregate card spend for the cycle.
    try {
      await _maybeBumpCardCycleSpend(userId, expenseId);
    } catch (_) {}
  }

  /// Existing call site: detect/link loans/EMIs.
  static Future<void> maybeAttachToLoan(String userId, String expenseId) async {
    try {
      await _maybeAttachLoanClassic(userId, expenseId);
    } catch (_) {}
  }

  // === SUBSCRIPTIONS (legacy, kept) ==========================================
  static Future<void> _maybeAttachSubscriptionClassic(
      String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;
    final data = exp.data()!;

    final matched = await _matchAndUpdateSubscription(userId, expenseId, data);
    if (matched != null) {
      await expRef
          .set({'linkedSubscriptionId': matched}, SetOptions(merge: true));
      return;
    }

    final amount = (data['amount'] as num).toDouble();
    final note = (data['note'] ?? '') as String;
    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();
    final brand = ((data['merchant'] ?? data['merchantKey']) ??
            data['counterparty'] ??
            'UNKNOWN')
        .toString();

    final isSubCue = RegExp(
          r'\b(auto[-\s]?debit|autopay|subscription|renew(al)?|membership|plan)\b',
          caseSensitive: false,
        ).hasMatch(note) ||
        (data['tags'] is List &&
            (data['tags'] as List).contains('subscription'));

    if (!isSubCue || brand == 'UNKNOWN' || brand.trim().isEmpty) return;

    final subCol =
        db.collection('users').doc(userId).collection('subscriptions');
    final found = await subCol.where('brand', isEqualTo: brand).limit(1).get();

    if (found.docs.isEmpty) {
      await subCol.add({
        'brand': brand,
        'slug': brand.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-'),
        'recurrence': 'monthly',
        'expectedAmount': amount,
        'tolerancePct': 12,
        'nextDue':
            Timestamp.fromDate(when.add(const Duration(days: _monthlyDays))),
        'lastPaidAt': Timestamp.fromDate(when),
        'active': true,
        'needsConfirmation': true,
        'history': [
          {
            'expenseId': expenseId,
            'at': Timestamp.fromDate(when),
            'amount': amount
          }
        ],
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      await expRef
          .set({'linkedSubscriptionId': 'PENDING'}, SetOptions(merge: true));
      return;
    }

    final subRef = found.docs.first.reference;
    final sub = found.docs.first.data();
    final expected = (sub['expectedAmount'] as num?)?.toDouble() ?? amount;
    final tolPct = (sub['tolerancePct'] as num?)?.toDouble() ?? 12.0;
    final okAmt =
        (amount - expected).abs() / (expected == 0 ? 1 : expected) * 100 <=
            tolPct + 0.5;

    if (okAmt) {
      final rec = (sub['recurrence'] as String?) ?? 'monthly';
      final next = rec == 'yearly'
          ? when.add(const Duration(days: _yearlyDays))
          : when.add(const Duration(days: _monthlyDays));
      await subRef.set({
        'expectedAmount': expected == 0 ? amount : expected,
        'lastPaidAt': Timestamp.fromDate(when),
        'nextDue': Timestamp.fromDate(next),
        'history': FieldValue.arrayUnion([
          {
            'expenseId': expenseId,
            'at': Timestamp.fromDate(when),
            'amount': amount
          }
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await expRef
          .set({'linkedSubscriptionId': subRef.id}, SetOptions(merge: true));
    }
  }

  static Future<void> _markSubscriptionPaidIfInWindow(
      String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;

    final data = exp.data()!;
    final matched = await _matchAndUpdateSubscription(userId, expenseId, data);
    if (matched != null) {
      await expRef
          .set({'linkedSubscriptionId': matched}, SetOptions(merge: true));
      return;
    }
    final amount = (data['amount'] as num).toDouble();
    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();
    final brand = ((data['merchant'] ?? data['merchantKey']) ??
            data['counterparty'] ??
            'UNKNOWN')
        .toString();
    if (brand == 'UNKNOWN' || brand.trim().isEmpty) return;

    final subCol =
        db.collection('users').doc(userId).collection('subscriptions');
    final q = await subCol
        .where('brand', isEqualTo: brand)
        .where('active', isEqualTo: true)
        .limit(1)
        .get();
    if (q.docs.isEmpty) return;

    final subRef = q.docs.first.reference;
    final sub = q.docs.first.data();
    final nextDue = (sub['nextDue'] as Timestamp?)?.toDate();
    if (nextDue == null) return;

    final inWindow = when.isAfter(nextDue.subtract(const Duration(days: 5))) &&
        when.isBefore(nextDue.add(const Duration(days: 5)));

    final expected = (sub['expectedAmount'] as num?)?.toDouble() ?? amount;
    final tolPct = (sub['tolerancePct'] as num?)?.toDouble() ?? 12.0;
    final okAmt =
        (amount - expected).abs() / (expected == 0 ? 1 : expected) * 100 <=
            tolPct + 0.5;

    if (inWindow && okAmt) {
      final rec = (sub['recurrence'] as String?) ?? 'monthly';
      final rolled = rec == 'yearly'
          ? nextDue.add(const Duration(days: _yearlyDays))
          : nextDue.add(const Duration(days: _monthlyDays));
      await subRef.set({
        'lastPaidAt': Timestamp.fromDate(when),
        'nextDue': Timestamp.fromDate(rolled),
        'history': FieldValue.arrayUnion([
          {
            'expenseId': expenseId,
            'at': Timestamp.fromDate(when),
            'amount': amount
          }
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await expRef
          .set({'linkedSubscriptionId': subRef.id}, SetOptions(merge: true));
    }
  }

  static Future<String?> _matchAndUpdateSubscription(
    String userId,
    String expenseId,
    Map<String, dynamic> data,
  ) async {
    final amount = (data['amount'] as num?)?.toDouble() ?? 0.0;
    if (amount <= 0) return null;
    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    final rawMerchant =
        data['merchant'] ?? data['merchantKey'] ?? data['counterparty'];
    final normalized = MerchantAlias.normalizeFromContext(
      raw: rawMerchant,
      upiVpa: data['upiVpa']?.toString(),
    );
    final fallback = MerchantAlias.normalize(rawMerchant);
    final candidateBrand =
        (normalized.isNotEmpty ? normalized : fallback).toUpperCase();
    final candidateKey =
        (data['merchantKey'] ?? candidateBrand).toString().toUpperCase();
    final instrument = _normInstrument(data['instrument'] ?? data['cardType']);
    final last4 = _normalizeLast4(data['cardLast4']?.toString());
    final network = (data['instrumentNetwork'] ?? '').toString().toUpperCase();
    final List<String> tags = data['tags'] is List
        ? (data['tags'] as List).map((e) => e.toString()).toList()
        : const <String>[];
    final autopay = hasAutopayCue((data['note'] ?? '').toString()) ||
        tags.any((t) => t.toLowerCase() == 'autopay');

    final db = FirebaseFirestore.instance;
    final subCol =
        db.collection('users').doc(userId).collection('subscriptions');
    final snapshot = await subCol.where('active', isEqualTo: true).get();
    if (snapshot.docs.isEmpty) return null;

    String? matchedId;
    for (final doc in snapshot.docs) {
      final sub = doc.data();
      final subBrand = (sub['brand'] ?? '').toString().toUpperCase();
      final subKey = (sub['merchantKey'] ?? subBrand).toString().toUpperCase();
      final subInstrument = _normInstrument(sub['instrument']);
      final subLast4 = _normalizeLast4(sub['cardLast4']?.toString());
      final subNetwork =
          (sub['instrumentNetwork'] ?? '').toString().toUpperCase();
      final expected = (sub['expectedAmount'] as num?)?.toDouble() ?? amount;
      final tolPct =
          ((sub['tolerancePct'] as num?)?.toDouble() ?? 15.0) / 100.0;
      final periodDays = (sub['periodDays'] as num?)?.toInt() ?? _monthlyDays;
      final recurrence =
          (sub['recurrence'] as String?)?.toLowerCase() ?? 'monthly';
      final Timestamp? nextDueTs =
          sub['nextDue'] is Timestamp ? sub['nextDue'] as Timestamp : null;
      final DateTime? nextDue = nextDueTs?.toDate();

      bool brandMatch = false;
      if (candidateBrand.isNotEmpty) {
        brandMatch = candidateBrand == subBrand || candidateBrand == subKey;
      }
      if (!brandMatch && candidateKey.isNotEmpty) {
        brandMatch = candidateKey == subBrand || candidateKey == subKey;
      }
      if (!brandMatch) continue;

      final candInstrument = instrument.toUpperCase();
      final docInstrument = subInstrument.toUpperCase();
      final instrumentMatch = docInstrument.isEmpty ||
          candInstrument == docInstrument ||
          candInstrument.contains(docInstrument) ||
          docInstrument.contains(candInstrument);
      if (!instrumentMatch) continue;

      if (subLast4 != null && subLast4.isNotEmpty) {
        if (last4 == null || last4 != subLast4) continue;
      }
      if (subNetwork.isNotEmpty && network.isNotEmpty && subNetwork != network) {
        continue;
      }

      final deltaPct =
          expected == 0 ? 0.0 : (amount - expected).abs() / expected;
      if (expected > 0 && deltaPct > tolPct + 0.05) continue;

      var window = 10;
      if (periodDays > 0) {
        window = recurrence == 'monthly'
            ? 10
            : math.max(7, (periodDays / 4).round());
      }

      var dateMatch = true;
      if (nextDue != null) {
        dateMatch = when.isAfter(nextDue.subtract(Duration(days: window))) &&
            when.isBefore(nextDue.add(Duration(days: window)));
      }

      if (!dateMatch && !autopay) continue;

      final historyEntry = {
        'expenseId': expenseId,
        'at': Timestamp.fromDate(when),
        'amount': amount,
      };

      final preview = <Map<String, dynamic>>[];
      final existingPreview = (sub['historyPreview'] as List?) ?? const [];
      for (final entry in existingPreview) {
        if (entry is Map<String, dynamic>) {
          preview.add(Map<String, dynamic>.from(entry));
        } else if (entry is Map) {
          preview.add(Map<String, dynamic>.from(entry));
        }
      }
      preview.add(historyEntry);
      if (preview.length > 8) {
        preview.removeRange(0, preview.length - 8);
      }

      final newNextDue =
          when.add(Duration(days: periodDays > 0 ? periodDays : _monthlyDays));
      final updates = <String, dynamic>{
        'lastPaidAt': Timestamp.fromDate(when),
        'nextDue': Timestamp.fromDate(newNextDue),
        'history': FieldValue.arrayUnion([historyEntry]),
        'historyPreview': preview,
        'expectedAmount': expected == 0 ? amount : expected,
        'updatedAt': FieldValue.serverTimestamp(),
        'active': true,
      };
      if (sub.containsKey('evidenceCount')) {
        updates['evidenceCount'] = FieldValue.increment(1);
      }
      if (autopay || dateMatch) {
        updates['needsConfirmation'] = false;
      }

      await doc.reference.set(updates, SetOptions(merge: true));
      matchedId = doc.id;
      break;
    }

    return matchedId;
  }

  static Future<List<Map<String, dynamic>>> detectSubscriptionsFromHistory(
    String userId, {
    int lookbackDays = 270,
  }) async {
    final since = DateTime.now().subtract(Duration(days: lookbackDays));
    final expenses = await ExpenseService().getExpenses(userId);
    final incomes = await IncomeService().getIncomes(userId);
    final exp = expenses.where((e) => !e.date.isBefore(since)).toList();
    final inc = incomes.where((i) => !i.date.isBefore(since)).toList();

    final evs = _collectEvidence(exp, inc);
    final out = <Map<String, dynamic>>[];

    for (final ev in evs) {
      if (ev.amounts.isEmpty) continue;
      final minAmt = ev.amounts
          .reduce((value, element) => value < element ? value : element);
      if (minAmt < 30 && !(ev.hasAutopayCue || ev.hasSubCues)) continue;

      final pg = _inferPeriod(ev.paidAt);
      final medianAmt = _median(ev.amounts);
      final tolPct = _toleranceForBrand(ev.brand);

      final has3 = ev.paidAt.length >= 3;
      final has2 = ev.paidAt.length >= 2;
      final okByPeriod = pg.period != 'unknown' && pg.confidence >= 0.6 && has3;
      final okByAuto = ev.hasAutopayCue && has2;

      if (!(okByPeriod || okByAuto)) continue;

      final history = <Map<String, dynamic>>[];
      for (var i = 0; i < ev.paidAt.length; i++) {
        history.add({
          'at': Timestamp.fromDate(ev.paidAt[i]),
          'amount': ev.amounts[i],
        });
      }

      final nextDays = pg.days > 0 ? pg.days : 30;
      final nextDueDate = ev.paidAt.isNotEmpty
          ? ev.paidAt.last.add(Duration(days: nextDays))
          : null;

      final strongPeriod = okByPeriod && pg.confidence >= 0.8;
      final strongAuto = ev.hasAutopayCue && ev.paidAt.length >= 2;
      final needsConfirmation =
          !(strongPeriod || strongAuto) || (minAmt < 100 && !strongAuto);

      final preview =
          history.length <= 6 ? history : history.sublist(history.length - 6);

      out.add({
        'brand': ev.brand,
        'merchantKey': ev.merchantKey,
        'instrument': ev.instrument,
        if (ev.last4 != null) 'cardLast4': ev.last4,
        if (ev.network != null && ev.network!.isNotEmpty)
          'instrumentNetwork': ev.network,
        'expectedAmount': medianAmt,
        'tolerancePct': (tolPct * 100).round(),
        'recurrence': pg.period == 'unknown' ? 'monthly' : pg.period,
        'periodDays': nextDays,
        'needsConfirmation': needsConfirmation,
        'evidenceCount': ev.paidAt.length,
        'history': history,
        'historyPreview': preview,
        'active': true,
        'source': 'detector_v2',
        if (nextDueDate != null) 'nextDue': Timestamp.fromDate(nextDueDate),
        'lastPaidAt': history.isNotEmpty ? history.last['at'] : null,
      });
    }

    return out;
  }

  static Future<void> rescanAndUpsertSubscriptions(String userId) async {
    final items = await detectSubscriptionsFromHistory(userId);
    final col = FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('subscriptions');

    for (final item in items) {
      final brand = (item['brand'] ?? 'SUB').toString().toUpperCase();
      final instrument = _normInstrument(item['instrument']);
      final last4 = _normalizeLast4(item['cardLast4']?.toString()) ?? 'XXXX';
      final network =
          (item['instrumentNetwork'] ?? '').toString().toUpperCase();
      final slug = brand.replaceAll(RegExp(r'[^A-Z0-9]+'), '_');
      final instSlug = instrument.replaceAll(RegExp(r'[^A-Z0-9]+'), '_');
      final networkSlug = network.isEmpty ? '' : '_$network';
      final docId = '${slug}_${instSlug}_$last4$networkSlug';

      final docRef = col.doc(docId);
      final docSnap = await docRef.get();
      final payload = Map<String, dynamic>.from(item);
      payload['instrument'] = instrument;
      if (payload['history'] is List) {
        payload['history'] = (payload['history'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (payload['historyPreview'] is List) {
        payload['historyPreview'] = (payload['historyPreview'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      payload['updatedAt'] = FieldValue.serverTimestamp();
      if (!docSnap.exists) {
        payload['createdAt'] = FieldValue.serverTimestamp();
      }

      await docRef.set(payload, SetOptions(merge: true));
    }

    final existing = await col.get();
    final now = DateTime.now();
    for (final doc in existing.docs) {
      final data = doc.data();
      if (data['active'] == false) continue;
      final periodDays = (data['periodDays'] as num?)?.toInt() ?? 30;
      final recurrence =
          (data['recurrence'] as String?)?.toLowerCase() ?? 'monthly';
      final Timestamp? nextDueTs =
          data['nextDue'] is Timestamp ? data['nextDue'] as Timestamp : null;
      final Timestamp? lastPaidTs = data['lastPaidAt'] is Timestamp
          ? data['lastPaidAt'] as Timestamp
          : null;
      final DateTime? anchor = nextDueTs?.toDate() ?? lastPaidTs?.toDate();
      if (anchor == null) continue;

      final grace = recurrence == 'monthly' ? 90 : math.max(periodDays * 2, 90);
      if (now.isAfter(anchor.add(Duration(days: grace)))) {
        await doc.reference.set({
          'active': false,
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }
    }
  }

  static Future<void> migrateSubscriptionsV2(String userId) async {
    await rescanAndUpsertSubscriptions(userId);
  }

  // === LOANS (legacy, kept) ==================================================
  static Future<void> _maybeAttachLoanClassic(
      String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;
    final data = exp.data()!;
    final note = (data['note'] ?? '') as String;
    final amount = (data['amount'] as num).toDouble();
    if (!RegExp(r'\b(EMI|LOAN|NACH|ECS|MANDATE)\b', caseSensitive: false)
            .hasMatch(note) &&
        !(data['tags'] is List && (data['tags'] as List).contains('loan_emi'))) {
      return;
    }

    final lender = CategoryRules.detectLoanLender(note) ?? 'LOAN';
    final loans = db.collection('users').doc(userId).collection('loans');
    final now = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    final found = await loans
        .where('lender', isEqualTo: lender)
        .where('active', isEqualTo: true)
        .limit(1)
        .get();
    if (found.docs.isEmpty) {
      await loans.add({
        'lender': lender,
        'emiAmount': amount,
        'dayOfMonth': now.day.clamp(1, 28),
        'nextDue': Timestamp.fromDate(
            DateTime(now.year, now.month + 1, now.day.clamp(1, 28))),
        'active': true,
        'needsConfirmation': true,
        'history': [
          {
            'expenseId': expenseId,
            'at': Timestamp.fromDate(now),
            'amount': amount
          }
        ],
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      await expRef.set({'linkedLoanId': 'PENDING'}, SetOptions(merge: true));
      return;
    }

    final loanRef = found.docs.first.reference;
    final loan = found.docs.first.data();
    final day = (loan['dayOfMonth'] as int?) ?? now.day.clamp(1, 28);
    final due = DateTime(now.year, now.month, day);
    final inWindow = now.isAfter(due.subtract(const Duration(days: 5))) &&
        now.isBefore(due.add(const Duration(days: 5)));

    if (inWindow) {
      await loanRef.set({
        'emiAmount': (loan['emiAmount'] as num?)?.toDouble() ?? amount,
        'nextDue': Timestamp.fromDate(DateTime(now.year, now.month + 1, day)),
        'history': FieldValue.arrayUnion([
          {
            'expenseId': expenseId,
            'at': Timestamp.fromDate(now),
            'amount': amount
          }
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await expRef.set({'linkedLoanId': loanRef.id}, SetOptions(merge: true));
    }
  }

  // === SIP / INVESTMENTS (NEW) ===============================================
  static Future<void> _maybeAttachSip(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;

    final data = exp.data()!;
    final note = (data['note'] ?? '') as String;
    final tags = (data['tags'] is List)
        ? List<String>.from(data['tags'])
        : const <String>[];
    final isInvest = CategoryRules.detectSip(note) ||
        tags.contains('sip') ||
        (data['category']?.toString().toLowerCase() == 'investments');

    if (!isInvest) return;

    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();
    final amount = (data['amount'] as num?)?.toDouble() ?? 0.0;
    final brand = ((data['merchant'] ?? data['merchantKey']) ??
            data['counterparty'] ??
            'SIP')
        .toString()
        .toUpperCase();

    final sipsCol = db.collection('users').doc(userId).collection('sips');
    final found = await sipsCol.where('brand', isEqualTo: brand).limit(1).get();

    if (found.docs.isEmpty) {
      await sipsCol.add({
        'brand': brand,
        'expectedAmount': amount,
        'recurrence': 'monthly',
        'dayOfMonth': when.day.clamp(1, 28),
        'nextDue': Timestamp.fromDate(
            DateTime(when.year, when.month + 1, when.day.clamp(1, 28))),
        'lastInvestedAt': Timestamp.fromDate(when),
        'active': true,
        'needsConfirmation': true,
        'history': [
          {
            'expenseId': expenseId,
            'at': Timestamp.fromDate(when),
            'amount': amount
          }
        ],
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      await expRef.set({'linkedSipId': 'PENDING'}, SetOptions(merge: true));
      return;
    }

    final sipRef = found.docs.first.reference;
    await sipRef.set({
      'lastInvestedAt': Timestamp.fromDate(when),
      'expectedAmount':
          (found.docs.first.data()['expectedAmount'] as num?)?.toDouble() ??
              amount,
      'nextDue': Timestamp.fromDate(
          DateTime(when.year, when.month + 1, when.day.clamp(1, 28))),
      'history': FieldValue.arrayUnion([
        {
          'expenseId': expenseId,
          'at': Timestamp.fromDate(when),
          'amount': amount
        }
      ]),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    await expRef.set({'linkedSipId': sipRef.id}, SetOptions(merge: true));
  }

  // === CREDIT CARDS (NEW) ====================================================
  /// Create/Update a card tracker when a Credit Card Bill is ingested.
  static Future<void> _maybeUpdateCardTrackers(
      String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .doc(expenseId);
    final snap = await expRef.get();
    if (!snap.exists) return;

    final e = snap.data()!;
    final type = (e['type'] ?? '').toString().toLowerCase();
    final isBill = e['isBill'] == true || type.contains('credit card bill');
    final isCardTxn =
        (e['cardType']?.toString().toLowerCase().contains('credit') ?? false) &&
            !isBill;

    final issuer =
        (e['issuerBank'] ?? e['bankLogo'] ?? e['merchant'] ?? e['merchantKey'])
            ?.toString();
    final last4 = e['cardLast4']?.toString();
    final network = e['instrumentNetwork']?.toString();
    final when = (e['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    if ((issuer == null || issuer.trim().isEmpty) &&
        (last4 == null || last4.trim().isEmpty)) {
      // Not enough to key a card doc; skip.
      return;
    }

    final cardId =
        [(issuer ?? 'CARD'), (last4 ?? 'XXXX')].join('_').toUpperCase();

    final cardRef =
        db.collection('users').doc(userId).collection('cards').doc(cardId);

    if (isBill) {
      // Update statement + dues
      final totalDue = (e['billTotalDue'] as num?)?.toDouble();
      final minDue = (e['billMinDue'] as num?)?.toDouble();
      final dueDate = (e['billDueDate'] is Timestamp)
          ? (e['billDueDate'] as Timestamp).toDate()
          : null;
      final stStart = (e['statementStart'] is Timestamp)
          ? (e['statementStart'] as Timestamp).toDate()
          : null;
      final stEnd = (e['statementEnd'] is Timestamp)
          ? (e['statementEnd'] as Timestamp).toDate()
          : null;

      await cardRef.set({
        'issuer': issuer?.toUpperCase(),
        'last4': last4,
        'network': network,
        'status': 'due', // until a payment txn is detected
        'lastBill': {
          if (totalDue != null) 'totalDue': totalDue,
          if (minDue != null) 'minDue': minDue,
          if (dueDate != null) 'dueDate': Timestamp.fromDate(dueDate),
          'expenseId': expenseId,
          'at': Timestamp.fromDate(when),
        },
        'lastStatement': {
          if (stStart != null) 'start': Timestamp.fromDate(stStart),
          if (stEnd != null) 'end': Timestamp.fromDate(stEnd),
        },
        // reset cycle spend when a new statement appears
        if (stStart != null && stEnd != null) 'spendThisCycle': 0.0,
        'updatedAt': FieldValue.serverTimestamp(),
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    }

    if (isCardTxn) {
      // Increment spend in current cycle (best-effort if we have a cycle window)
      await _maybeBumpCardCycleSpend(userId, expenseId);
    }
  }

  static Future<void> _maybeBumpCardCycleSpend(
      String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .doc(expenseId);
    final snap = await expRef.get();
    if (!snap.exists) return;
    final e = snap.data()!;

    final isCredit =
        (e['cardType']?.toString().toLowerCase().contains('credit') ?? false) &&
            (e['isBill'] != true);
    if (!isCredit) return;

    final issuer =
        (e['issuerBank'] ?? e['merchant'] ?? e['merchantKey'])?.toString();
    final last4 = e['cardLast4']?.toString();
    final amount = (e['amount'] as num?)?.toDouble() ?? 0.0;
    final when = (e['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    if ((issuer == null || issuer.trim().isEmpty) &&
        (last4 == null || last4.trim().isEmpty)) {
      return;
    }
    final cardId =
        [(issuer ?? 'CARD'), (last4 ?? 'XXXX')].join('_').toUpperCase();
    final cardRef =
        db.collection('users').doc(userId).collection('cards').doc(cardId);

    final card = await cardRef.get();
    final hasWindow = card.exists && card.data()?['lastStatement'] is Map;
    if (hasWindow) {
      final st =
          Map<String, dynamic>.from(card.data()!['lastStatement'] as Map);
      final start = _asDate(st['start']);
      final end = _asDate(st['end']);
      if (start != null && end != null) {
        final inCycle = when.isAfter(start) &&
            when.isBefore(end.add(const Duration(days: 1)));
        if (!inCycle) {
          // If out of known window, still track a generic rolling spend
          await cardRef.set({
            'rollingSpend': FieldValue.increment(amount),
            'updatedAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
          return;
        }
      }
    }
    await cardRef.set({
      'spendThisCycle': FieldValue.increment(amount),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  // === UTILITIES =============================================================
  static DateTime? _asDate(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    if (v is String) return DateTime.tryParse(v);
    return null;
  }
}
