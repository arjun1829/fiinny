// lib/services/recurring/recurring_engine.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../categorization/category_rules.dart';

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
  static Future<void> maybeAttachToSubscription(String userId, String expenseId) async {
    try {
      await _maybeUpdateCardTrackers(userId, expenseId); // NEW
    } catch (_) {}
    try {
      await _maybeAttachSip(userId, expenseId);          // NEW
    } catch (_) {}
    try {
      await _maybeAttachSubscriptionClassic(userId, expenseId); // legacy behavior
    } catch (_) {}
  }

  /// Existing call site: rolls subscription window if a matching payment lands.
  static Future<void> markPaidIfInWindow(String userId, String expenseId) async {
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
  static Future<void> _maybeAttachSubscriptionClassic(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db.collection('users').doc(userId).collection('expenses').doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;
    final data = exp.data()!;
    final amount = (data['amount'] as num).toDouble();
    final note = (data['note'] ?? '') as String;
    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();
    final brand = ((data['merchant'] ?? data['merchantKey']) ?? data['counterparty'] ?? 'UNKNOWN').toString();

    final isSubCue = RegExp(
      r'\b(auto[-\s]?debit|autopay|subscription|renew(al)?|membership|plan)\b',
      caseSensitive: false,
    ).hasMatch(note) || (data['tags'] is List && (data['tags'] as List).contains('subscription'));

    if (!isSubCue || brand == 'UNKNOWN' || brand.trim().isEmpty) return;

    final subCol = db.collection('users').doc(userId).collection('subscriptions');
    final found = await subCol.where('brand', isEqualTo: brand).limit(1).get();

    if (found.docs.isEmpty) {
      await subCol.add({
        'brand': brand,
        'slug': brand.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-'),
        'recurrence': 'monthly',
        'expectedAmount': amount,
        'tolerancePct': 12,
        'nextDue': Timestamp.fromDate(when.add(const Duration(days: _monthlyDays))),
        'lastPaidAt': Timestamp.fromDate(when),
        'active': true,
        'needsConfirmation': true,
        'history': [
          {'expenseId': expenseId, 'at': Timestamp.fromDate(when), 'amount': amount}
        ],
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      await expRef.set({'linkedSubscriptionId': 'PENDING'}, SetOptions(merge: true));
      return;
    }

    final subRef = found.docs.first.reference;
    final sub = found.docs.first.data();
    final expected = (sub['expectedAmount'] as num?)?.toDouble() ?? amount;
    final tolPct = (sub['tolerancePct'] as num?)?.toDouble() ?? 12.0;
    final okAmt = (amount - expected).abs() / (expected == 0 ? 1 : expected) * 100 <= tolPct + 0.5;

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
          {'expenseId': expenseId, 'at': Timestamp.fromDate(when), 'amount': amount}
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await expRef.set({'linkedSubscriptionId': subRef.id}, SetOptions(merge: true));
    }
  }

  static Future<void> _markSubscriptionPaidIfInWindow(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db.collection('users').doc(userId).collection('expenses').doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;

    final data = exp.data()!;
    final amount = (data['amount'] as num).toDouble();
    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();
    final brand = ((data['merchant'] ?? data['merchantKey']) ?? data['counterparty'] ?? 'UNKNOWN').toString();
    if (brand == 'UNKNOWN' || brand.trim().isEmpty) return;

    final subCol = db.collection('users').doc(userId).collection('subscriptions');
    final q = await subCol.where('brand', isEqualTo: brand).where('active', isEqualTo: true).limit(1).get();
    if (q.docs.isEmpty) return;

    final subRef = q.docs.first.reference;
    final sub = q.docs.first.data();
    final nextDue = (sub['nextDue'] as Timestamp?)?.toDate();
    if (nextDue == null) return;

    final inWindow = when.isAfter(nextDue.subtract(const Duration(days: 5))) &&
        when.isBefore(nextDue.add(const Duration(days: 5)));

    final expected = (sub['expectedAmount'] as num?)?.toDouble() ?? amount;
    final tolPct = (sub['tolerancePct'] as num?)?.toDouble() ?? 12.0;
    final okAmt = (amount - expected).abs() / (expected == 0 ? 1 : expected) * 100 <= tolPct + 0.5;

    if (inWindow && okAmt) {
      final rec = (sub['recurrence'] as String?) ?? 'monthly';
      final rolled = rec == 'yearly'
          ? nextDue.add(const Duration(days: _yearlyDays))
          : nextDue.add(const Duration(days: _monthlyDays));
      await subRef.set({
        'lastPaidAt': Timestamp.fromDate(when),
        'nextDue': Timestamp.fromDate(rolled),
        'history': FieldValue.arrayUnion([
          {'expenseId': expenseId, 'at': Timestamp.fromDate(when), 'amount': amount}
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await expRef.set({'linkedSubscriptionId': subRef.id}, SetOptions(merge: true));
    }
  }

  // === LOANS (legacy, kept) ==================================================
  static Future<void> _maybeAttachLoanClassic(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db.collection('users').doc(userId).collection('expenses').doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;
    final data = exp.data()!;
    final note = (data['note'] ?? '') as String;
    final amount = (data['amount'] as num).toDouble();
    if (!RegExp(r'\b(EMI|LOAN|NACH|ECS|MANDATE)\b', caseSensitive: false).hasMatch(note) &&
        !(data['tags'] is List && (data['tags'] as List).contains('loan_emi'))) return;

    final lender = CategoryRules.detectLoanLender(note) ?? 'LOAN';
    final loans = db.collection('users').doc(userId).collection('loans');
    final now = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    final found = await loans.where('lender', isEqualTo: lender).where('active', isEqualTo: true).limit(1).get();
    if (found.docs.isEmpty) {
      await loans.add({
        'lender': lender,
        'emiAmount': amount,
        'dayOfMonth': now.day.clamp(1, 28),
        'nextDue': Timestamp.fromDate(DateTime(now.year, now.month + 1, now.day.clamp(1, 28))),
        'active': true,
        'needsConfirmation': true,
        'history': [
          {'expenseId': expenseId, 'at': Timestamp.fromDate(now), 'amount': amount}
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
          {'expenseId': expenseId, 'at': Timestamp.fromDate(now), 'amount': amount}
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await expRef.set({'linkedLoanId': loanRef.id}, SetOptions(merge: true));
    }
  }

  // === SIP / INVESTMENTS (NEW) ===============================================
  static Future<void> _maybeAttachSip(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db.collection('users').doc(userId).collection('expenses').doc(expenseId);
    final exp = await expRef.get();
    if (!exp.exists) return;

    final data = exp.data()!;
    final note = (data['note'] ?? '') as String;
    final tags = (data['tags'] is List) ? List<String>.from(data['tags']) : const <String>[];
    final isInvest =
        CategoryRules.detectSip(note) ||
            tags.contains('sip') ||
            (data['category']?.toString().toLowerCase() == 'investments');

    if (!isInvest) return;

    final when = (data['date'] as Timestamp?)?.toDate() ?? DateTime.now();
    final amount = (data['amount'] as num?)?.toDouble() ?? 0.0;
    final brand = ((data['merchant'] ?? data['merchantKey']) ?? data['counterparty'] ?? 'SIP')
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
        'nextDue': Timestamp.fromDate(DateTime(when.year, when.month + 1, when.day.clamp(1, 28))),
        'lastInvestedAt': Timestamp.fromDate(when),
        'active': true,
        'needsConfirmation': true,
        'history': [
          {'expenseId': expenseId, 'at': Timestamp.fromDate(when), 'amount': amount}
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
      'expectedAmount': (found.docs.first.data()['expectedAmount'] as num?)?.toDouble() ?? amount,
      'nextDue': Timestamp.fromDate(DateTime(when.year, when.month + 1, when.day.clamp(1, 28))),
      'history': FieldValue.arrayUnion([
        {'expenseId': expenseId, 'at': Timestamp.fromDate(when), 'amount': amount}
      ]),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    await expRef.set({'linkedSipId': sipRef.id}, SetOptions(merge: true));
  }

  // === CREDIT CARDS (NEW) ====================================================
  /// Create/Update a card tracker when a Credit Card Bill is ingested.
  static Future<void> _maybeUpdateCardTrackers(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db.collection('users').doc(userId).collection('expenses').doc(expenseId);
    final snap = await expRef.get();
    if (!snap.exists) return;

    final e = snap.data()!;
    final type = (e['type'] ?? '').toString().toLowerCase();
    final isBill = e['isBill'] == true || type.contains('credit card bill');
    final isCardTxn = (e['cardType']?.toString().toLowerCase().contains('credit') ?? false) && !isBill;

    final issuer = (e['issuerBank'] ?? e['bankLogo'] ?? e['merchant'] ?? e['merchantKey'])?.toString();
    final last4 = e['cardLast4']?.toString();
    final network = e['instrumentNetwork']?.toString();
    final when = (e['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    if ((issuer == null || issuer.trim().isEmpty) && (last4 == null || last4.trim().isEmpty)) {
      // Not enough to key a card doc; skip.
      return;
    }

    final cardId = [
      (issuer ?? 'CARD'),
      (last4 ?? 'XXXX')
    ].join('_').toUpperCase();

    final cardRef = db.collection('users').doc(userId).collection('cards').doc(cardId);

    if (isBill) {
      // Update statement + dues
      final totalDue = (e['billTotalDue'] as num?)?.toDouble();
      final minDue = (e['billMinDue'] as num?)?.toDouble();
      final dueDate = (e['billDueDate'] is Timestamp) ? (e['billDueDate'] as Timestamp).toDate() : null;
      final stStart = (e['statementStart'] is Timestamp) ? (e['statementStart'] as Timestamp).toDate() : null;
      final stEnd = (e['statementEnd'] is Timestamp) ? (e['statementEnd'] as Timestamp).toDate() : null;

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

  static Future<void> _maybeBumpCardCycleSpend(String userId, String expenseId) async {
    final db = FirebaseFirestore.instance;
    final expRef = db.collection('users').doc(userId).collection('expenses').doc(expenseId);
    final snap = await expRef.get();
    if (!snap.exists) return;
    final e = snap.data()!;

    final isCredit = (e['cardType']?.toString().toLowerCase().contains('credit') ?? false) && (e['isBill'] != true);
    if (!isCredit) return;

    final issuer = (e['issuerBank'] ?? e['merchant'] ?? e['merchantKey'])?.toString();
    final last4 = e['cardLast4']?.toString();
    final amount = (e['amount'] as num?)?.toDouble() ?? 0.0;
    final when = (e['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    if ((issuer == null || issuer.trim().isEmpty) && (last4 == null || last4.trim().isEmpty)) return;
    final cardId = [(issuer ?? 'CARD'), (last4 ?? 'XXXX')].join('_').toUpperCase();
    final cardRef = db.collection('users').doc(userId).collection('cards').doc(cardId);

    final card = await cardRef.get();
    final hasWindow = card.exists && card.data()?['lastStatement'] is Map;
    if (hasWindow) {
      final st = Map<String, dynamic>.from(card.data()!['lastStatement'] as Map);
      final start = _asDate(st['start']);
      final end = _asDate(st['end']);
      if (start != null && end != null) {
        final inCycle = when.isAfter(start) && when.isBefore(end.add(const Duration(days: 1)));
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
