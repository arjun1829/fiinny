// lib/services/loan_service.dart
import 'dart:math' as math;
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/loan_model.dart';
import '../logic/loan_detection_parser.dart';

class LoanService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // --------------------------- Collections & Converters ---------------------------

  CollectionReference<Map<String, dynamic>> get _raw =>
      _db.collection('loans'); // keep your top-level 'loans' collection

  /// Query scoped to a user
  Query<Map<String, dynamic>> _userQuery(String userId) =>
      _raw.where('userId', isEqualTo: userId);

  /// Typed converter (handy for reads/writes)
  CollectionReference<LoanModel> get _typed => _raw.withConverter<LoanModel>(
        fromFirestore: (snap, _) =>
            LoanModel.fromJson(snap.data() ?? {}, snap.id),
        toFirestore: (loan, _) => loan.toJson(asTimestamp: true),
      );

  DocumentReference<LoanModel> _doc(String id) => _typed.doc(id);

  // ------------------------------------ CRUD ------------------------------------

  /// Ordered by createdAt desc if index exists; falls back gracefully.
  Future<List<LoanModel>> getLoans(String userId) async {
    try {
      final snap =
          await _userQuery(userId).orderBy('createdAt', descending: true).get();
      return snap.docs.map((d) => LoanModel.fromJson(d.data(), d.id)).toList();
    } on FirebaseException catch (e) {
      if (e.code == 'failed-precondition') {
        final snap = await _userQuery(userId).get(); // no index yet
        return snap.docs
            .map((d) => LoanModel.fromJson(d.data(), d.id))
            .toList();
      }
      rethrow;
    }
  }

  Stream<List<LoanModel>> loansStream(String userId) {
    return _userQuery(userId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((s) =>
            s.docs.map((d) => LoanModel.fromJson(d.data(), d.id)).toList());
  }

  Future<LoanModel?> getById(String loanId) async {
    final snap = await _raw.doc(loanId).get();
    if (!snap.exists) return null;
    return LoanModel.fromJson(snap.data()!, snap.id);
  }

  Future<String> addLoan(LoanModel loan) async {
    // ensure server timestamp for createdAt if not provided
    final data = loan.toJson(asTimestamp: true);
    data['createdAt'] ??= FieldValue.serverTimestamp();
    final doc = await _raw.add(data);
    return doc.id;
  }

  Future<void> updateLoan(LoanModel loan) async {
    if (loan.id == null) throw ArgumentError('updateLoan requires loan.id');
    await _raw.doc(loan.id).update(loan.toJson(asTimestamp: true));
  }

  /// Merge-save (safe for partials)
  Future<void> saveLoan(LoanModel loan) async {
    if (loan.id == null) throw ArgumentError('saveLoan requires loan.id');
    await _raw.doc(loan.id!).set(
          loan.toJson(asTimestamp: true),
          SetOptions(merge: true),
        );
  }

  /// Patch specific fields. Converts DateTime -> Timestamp if [asTimestamp] true.
  Future<void> patch(
    String loanId,
    Map<String, dynamic> fields, {
    bool asTimestamp = true,
  }) async {
    fields.removeWhere((_, v) => v == null);
    if (asTimestamp) {
      fields.updateAll((k, v) {
        if (v is DateTime) return Timestamp.fromDate(v);
        return v;
      });
    }
    await _raw.doc(loanId).update(fields);
  }

  Future<void> deleteLoan(String loanId) async {
    await _raw.doc(loanId).delete();
  }

  // --------------------------------- Status ---------------------------------

  Future<void> closeLoan(String loanId) => patch(loanId, {'isClosed': true});
  Future<void> reopenLoan(String loanId) => patch(loanId, {'isClosed': false});

  // ----------------------------- Reminders / Prefs -----------------------------

  Future<void> setReminderPrefs(
    String loanId, {
    bool? enabled,
    int? daysBefore,
    String? timeHHmm,
  }) {
    return patch(loanId, {
      if (enabled != null) 'reminderEnabled': enabled,
      if (daysBefore != null) 'reminderDaysBefore': daysBefore,
      if (timeHHmm != null) 'reminderTime': timeHHmm,
    });
  }

  Future<void> setAutopay(String loanId, bool value) =>
      patch(loanId, {'autopay': value});

  Future<void> setPaymentDay(String loanId, int dayOfMonth) =>
      patch(loanId, {'paymentDayOfMonth': dayOfMonth.clamp(1, 28)});

  Future<void> setBillCycleDay(String loanId, int dayOfMonth) =>
      patch(loanId, {'billCycleDay': dayOfMonth.clamp(1, 28)});

  Future<void> setAccountMeta(String loanId, {String? last4, double? minDue}) =>
      patch(loanId, {
        if (last4 != null) 'accountLast4': last4,
        if (minDue != null) 'minDue': minDue,
      });

  // ---------------------------------- Tags ----------------------------------

  Future<void> addTags(String loanId, List<String> newTags) async {
    await _raw.doc(loanId).update({
      'tags': FieldValue.arrayUnion(newTags),
    });
  }

  Future<void> removeTags(String loanId, List<String> remove) async {
    await _raw.doc(loanId).update({
      'tags': FieldValue.arrayRemove(remove),
    });
  }

  // ------------------------- Payments (safe transactions) ----------------------

  /// Records a payment and reduces outstanding [amount].
  /// - Updates lastPaymentDate/lastPaymentAmount
  /// - Auto-closes if outstanding <= 0
  Future<void> recordPayment({
    required String loanId,
    required double paymentAmount,
    DateTime? paidAt,
  }) async {
    assert(paymentAmount > 0, 'paymentAmount must be > 0');

    await _db.runTransaction((tx) async {
      final ref = _raw.doc(loanId);
      final snap = await tx.get(ref);
      if (!snap.exists) throw StateError('Loan not found');

      final loan = LoanModel.fromJson(snap.data()!, snap.id);
      final newOutstanding =
          (loan.amount - paymentAmount).clamp(0.0, double.infinity);

      final now = paidAt ?? DateTime.now();

      final update = {
        'amount': newOutstanding,
        'lastPaymentDate': Timestamp.fromDate(now),
        'lastPaymentAmount': paymentAmount,
      };

      // close if paid off
      if (newOutstanding <= 0 && !loan.isClosed) {
        update['isClosed'] = true;
      }

      tx.update(ref, update);
    });
  }

  // ------------------------------- Queries ---------------------------------

  Stream<List<LoanModel>> activeLoansStream(String userId) {
    return _userQuery(userId)
        .where('isClosed', isEqualTo: false)
        .orderBy('startDate', descending: true)
        .snapshots()
        .map((s) =>
            s.docs.map((d) => LoanModel.fromJson(d.data(), d.id)).toList());
  }

  Stream<List<LoanModel>> closedLoansStream(String userId) {
    return _userQuery(userId)
        .where('isClosed', isEqualTo: true)
        .orderBy('startDate', descending: true)
        .snapshots()
        .map((s) =>
            s.docs.map((d) => LoanModel.fromJson(d.data(), d.id)).toList());
  }

  Stream<List<LoanModel>> overdueLoansStream(String userId) {
    // client-side filter (Firestore can't query on computed "overdue")
    return loansStream(userId).map((list) {
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      return list.where((l) {
        if (l.isClosed) return false;
        final nd = l.nextPaymentDate();
        return nd != null && nd.isBefore(today);
      }).toList();
    });
  }

  Stream<List<LoanModel>> highInterestStream(String userId,
      {double threshold = 24}) {
    return loansStream(userId).map((list) => list
        .where((l) => (l.interestRate ?? 0) >= threshold && !l.isClosed)
        .toList());
  }

  Future<List<LoanModel>> byLenderType(String userId, String lenderType) async {
    final snap = await _userQuery(userId)
        .where('lenderType', isEqualTo: lenderType)
        .get();
    return snap.docs.map((d) => LoanModel.fromJson(d.data(), d.id)).toList();
  }

  Future<List<LoanModel>> searchByTitle(String userId, String query) async {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return getLoans(userId);
    final all = await getLoans(userId);
    return all.where((l) => l.title.toLowerCase().contains(q)).toList();
  }

  // ------------------------------- Aggregates --------------------------------

  Future<int> countOpenLoans(String userId) async {
    final snap =
        await _userQuery(userId).where('isClosed', isEqualTo: false).get();
    return snap.docs.length;
  }

  Future<double> sumOutstanding(String userId) async {
    final snap =
        await _userQuery(userId).where('isClosed', isEqualTo: false).get();

    double sum = 0;
    for (final d in snap.docs) {
      final data = d.data();
      final numish = (data['outstanding'] ??
          data['remaining'] ??
          data['remainingPrincipal'] ??
          data['amount'] ??
          0) as num;
      sum += numish.toDouble();
    }
    return sum;
  }

  Future<Map<String, num>> totals(String userId) async {
    final loans = await getLoans(userId);
    final total = loans.fold<double>(0, (a, l) => a + l.amount);
    final activePrincipal =
        loans.where((l) => !l.isClosed).fold<double>(0, (a, l) => a + l.amount);
    final closedPrincipal = total - activePrincipal;
    final monthlyEmi = loans
        .where((l) => !l.isClosed && (l.emi ?? 0) > 0)
        .fold<double>(0, (a, l) => a + (l.emi ?? 0));

    return {
      'total': total,
      'activePrincipal': activePrincipal,
      'closedPrincipal': closedPrincipal,
      'monthlyEmi': monthlyEmi,
      'count': loans.length,
      'activeCount': loans.where((l) => !l.isClosed).length,
      'closedCount': loans.where((l) => l.isClosed).length,
    };
  }
  // ----------------------------- Sharing (optional) -----------------------------

  /// Sets or updates sharing on a loan.
  /// Persists under a single `share` object and a flattened `shareMemberPhones`
  /// array for efficient queries.
  /// members: [{ name, phone, userId, percent }]
  Future<void> setSharing(
    String loanId, {
    required List<Map<String, dynamic>> members,
    bool equalSplit = true,
  }) async {
    // sanitize & coerce
    final cleaned = members
        .map((m) {
          final name = (m['name'] ?? '').toString().trim();
          final phone = (m['phone'] ?? '').toString().trim();
          final userId = (m['userId'] ?? '').toString().trim();
          final pct =
              (m['percent'] is num) ? (m['percent'] as num).toDouble() : null;

          return {
            if (name.isNotEmpty) 'name': name,
            if (phone.isNotEmpty) 'phone': phone,
            if (userId.isNotEmpty) 'userId': userId,
            if (pct != null) 'percent': pct,
          };
        })
        .where((m) => m.isNotEmpty)
        .toList();

    final phones = cleaned
        .map((e) => (e['phone'] ?? '').toString())
        .where((p) => p.isNotEmpty)
        .toSet()
        .toList();

    await patch(loanId, {
      'share': {
        'isShared': cleaned.isNotEmpty,
        'mode': equalSplit ? 'equal' : 'custom',
        'members': cleaned,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      'shareMemberPhones': phones, // flattened indexable list
    });
  }

  /// Clears structured sharing. (Keeps your free-text note untouched.)
  Future<void> clearSharing(String loanId) async {
    await patch(loanId, {
      'share': {
        'isShared': false,
        'mode': 'equal',
        'members': [],
        'updatedAt': FieldValue.serverTimestamp(),
      },
      'shareMemberPhones': [],
    });
  }

  /// Fetch loans shared with a phone number (works even if user isn’t the owner).
  Future<List<LoanModel>> loansSharedWithPhone(String phone) async {
    final snap =
        await _raw.where('shareMemberPhones', arrayContains: phone).get();

    return snap.docs.map((d) => LoanModel.fromJson(d.data(), d.id)).toList();
  }

  // -------------------------------- Analytics --------------------------------

  /// Upcoming EMIs within [withinDays]; uses model.nextPaymentDate() and falls back
  /// to estimated EMI if missing.
  Future<List<LoanEmiDue>> upcomingEmis(String userId,
      {int withinDays = 14}) async {
    final loans = (await getLoans(userId)).where((l) => !l.isClosed).toList();
    final now = DateTime.now();
    final horizon = now.add(Duration(days: withinDays));
    final result = <LoanEmiDue>[];

    for (final l in loans) {
      final next = l.nextPaymentDate(now: now);
      if (next == null || next.isAfter(horizon)) continue;
      final amt = (l.emi ?? _estimateEmi(l)) ?? 0.0;
      result.add(LoanEmiDue(loan: l, dueDate: next, amount: amt));
    }

    result.sort((a, b) => a.dueDate.compareTo(b.dueDate));
    return result;
  }

  // ------------------------------ Calculations -------------------------------

  double? _estimateEmi(LoanModel l) {
    if (l.interestRate == null ||
        l.tenureMonths == null ||
        l.tenureMonths! <= 0) {
      return null;
    }
    final P = l.amount;
    final n = l.tenureMonths!.toDouble();
    final r = (l.interestRate! / 12.0) / 100.0;

    if (l.interestMethod == LoanInterestMethod.flat) {
      final totalInterest = P * (l.interestRate! / 100.0) * (n / 12.0);
      return (P + totalInterest) / n;
    } else {
      // reducing balance
      if (r == 0) return P / n;
      final pow = math.pow(1 + r, n) as double;
      return (P * r * pow) / (pow - 1);
    }
  }

  // ------------------------------ Detection -------------------------------

  /// Mass detection from a list of strings (e.g. recent SMS history).
  List<LoanModel> detectLoansFromTexts(List<String> messages,
      {String userId = ''}) {
    final results = <LoanModel>[];
    for (final msg in messages) {
      final res = LoanDetectionParser.parse(msg);
      if (res != null) {
        results.add(LoanModel.fromParserResult(res, userId: userId));
      }
    }
    return results;
  }
}

// Simple DTO for upcoming EMI cards / notifications
class LoanEmiDue {
  final LoanModel loan;
  final DateTime dueDate;
  final double amount;
  LoanEmiDue({required this.loan, required this.dueDate, required this.amount});
}
