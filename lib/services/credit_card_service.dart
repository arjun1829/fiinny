import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/credit_card_cycle.dart';
import '../models/credit_card_model.dart';
import '../models/credit_card_payment.dart';

class CreditCardService {
  final _db = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _cardsCol(String userId) => _db
      .collection('users')
      .doc(userId)
      .collection('credit_cards');

  DocumentReference<Map<String, dynamic>> _cardDoc(
          String userId, String cardId) =>
      _cardsCol(userId).doc(cardId);

  CollectionReference<Map<String, dynamic>> _cyclesCol(
          String userId, String cardId) =>
      _cardDoc(userId, cardId).collection('cycles');

  DocumentReference<Map<String, dynamic>> _cycleDoc(
          String userId, String cardId, String cycleId) =>
      _cyclesCol(userId, cardId).doc(cycleId);

  CollectionReference<Map<String, dynamic>> _payCol(
          String userId, String cardId) =>
      _cardDoc(userId, cardId).collection('payments');

  // ---- Cards ----
  Future<List<CreditCardModel>> getUserCards(String userId) async {
    final q = await _cardsCol(userId).orderBy('bankName').get();
    return q.docs
        .map((d) => CreditCardModel.fromJson({'id': d.id, ...d.data()}))
        .toList();
  }

  Future<void> saveCard(String userId, CreditCardModel card) async {
    await _cardDoc(userId, card.id)
        .set(card.toJson(), SetOptions(merge: true));
  }

  Future<void> deleteCard(String userId, String cardId) async {
    await _cardDoc(userId, cardId).delete();
  }

  // ---- Cycles ----
  Future<void> upsertCycle(
    String userId,
    String cardId,
    CreditCardCycle cycle,
  ) async {
    await _cycleDoc(userId, cardId, cycle.id)
        .set(cycle.toJson(), SetOptions(merge: true));
  }

  Future<CreditCardCycle?> getLatestCycle(String userId, String cardId) async {
    final q = await _cyclesCol(userId, cardId)
        .orderBy('statementDate', descending: true)
        .limit(1)
        .get();
    if (q.docs.isEmpty) return null;
    final d = q.docs.first;
    return CreditCardCycle.fromJson({'id': d.id, ...d.data()});
  }

  Future<List<CreditCardCycle>> listCycles(String userId, String cardId,
      {int limit = 12}) async {
    final q = await _cyclesCol(userId, cardId)
        .orderBy('statementDate', descending: true)
        .limit(limit)
        .get();
    return q.docs
        .map((d) => CreditCardCycle.fromJson({'id': d.id, ...d.data()}))
        .toList();
  }

  // ---- Payments ----
  Future<void> addPayment(
    String userId,
    String cardId,
    CreditCardPayment p,
  ) async {
    await _payCol(userId, cardId).doc(p.id).set(p.toJson());
  }

  Future<List<CreditCardPayment>> listPayments(
    String userId,
    String cardId,
    DateTime from,
    DateTime to,
  ) async {
    final q = await _payCol(userId, cardId)
        .where('date', isGreaterThanOrEqualTo: from.toIso8601String())
        .where('date', isLessThanOrEqualTo: to.toIso8601String())
        .get();
    return q.docs.map((d) => CreditCardPayment.fromJson(d.data())).toList();
  }

  // ---- Reconcile ----
  Future<void> recomputeCycleStatus(
    String userId,
    String cardId,
    String cycleId,
  ) async {
    final cycSnap = await _cycleDoc(userId, cardId, cycleId).get();
    if (!cycSnap.exists) return;
    final cyc =
        CreditCardCycle.fromJson({'id': cycSnap.id, ...?cycSnap.data()});

    final pays = await listPayments(
        userId, cardId, cyc.periodStart, cyc.dueDate);
    final paid = pays.fold<double>(0, (a, b) => a + b.amount);

    String status = 'open';
    DateTime? lastPaid;
    if (pays.isNotEmpty) {
      pays.sort((a, b) => a.date.compareTo(b.date));
      lastPaid = pays.last.date;
    }

    final now = DateTime.now();
    if (paid >= cyc.totalDue - 0.5) {
      status = 'paid';
    } else if (paid >= cyc.minDue - 0.5) {
      status = now.isAfter(cyc.dueDate) ? 'overdue' : 'partial';
    } else {
      status = now.isAfter(cyc.dueDate) ? 'overdue' : 'open';
    }

    await _cycleDoc(userId, cardId, cycleId).set({
      'paidAmount': paid,
      'status': status,
      'lastPaymentAt': lastPaid?.toIso8601String(),
    }, SetOptions(merge: true));
  }

  // Convenience: mark current bill as paid (adds a payment == remaining due)
  Future<void> markCardBillPaid(
    String userId,
    String cardId,
    DateTime paidDate,
  ) async {
    final latest = await getLatestCycle(userId, cardId);
    if (latest == null) return;

    final double remaining = (latest.totalDue - latest.paidAmount)
        .clamp(0.0, double.infinity);
    if (remaining <= 0.01) return;

    final p = CreditCardPayment(
      id: 'manual_${paidDate.millisecondsSinceEpoch}',
      amount: remaining,
      date: paidDate,
      source: 'manual',
      ref: null,
    );
    await addPayment(userId, cardId, p);
    await recomputeCycleStatus(userId, cardId, latest.id);
  }

  // ---- Metadata Updates (Limits, Rewards, Loans) ----
  Future<void> updateCardMetadata(
    String userId,
    String cardId, {
    double? availableLimit,
    double? totalLimit,
    double? rewardPoints,
    double? lastStatementBalance,
  }) async {
    final Map<String, dynamic> updates = {};
    if (availableLimit != null) updates['availableCredit'] = availableLimit; // map to model field
    if (totalLimit != null) updates['creditLimit'] = totalLimit;
    if (rewardPoints != null) updates['rewardPoints'] = rewardPoints;
    if (lastStatementBalance != null) updates['lastStatementBalance'] = lastStatementBalance;

    if (updates.isNotEmpty) {
      await _cardDoc(userId, cardId).set(updates, SetOptions(merge: true));
    }
  }

  Future<void> recordLoanOffer(
    String userId,
    String cardId,
    Map<String, dynamic> offerDetails,
  ) async {
    // timestamp the offer
    offerDetails['detectedAt'] = DateTime.now().toIso8601String();
    
    // Add to specific loan offers sub-collection OR array in card doc
    // Using arrayUnion on card doc for simplicity as per plan
    await _cardDoc(userId, cardId).update({
      'loanOffers': FieldValue.arrayUnion([offerDetails])
    });
  }
  Future<void> updateCardMetadataByMatch(
    String userId, {
    required String? bankName,
    required String? last4,
    double? availableLimit,
    double? totalLimit,
    double? rewardPoints,
    double? lastStatementBalance,
  }) async {
    if (bankName == null && last4 == null) return;

    final cards = await getUserCards(userId);
    // Best effort match
    final match = cards.cast<CreditCardModel?>().firstWhere(
      (c) {
        final bMatch = bankName == null || c?.bankName.toUpperCase() == bankName.toUpperCase();
        final lMatch = last4 == null || c?.last4Digits == last4;
        return bMatch && lMatch;
      },
      orElse: () => null,
    );

    if (match != null) {
      await updateCardMetadata(
        userId,
        match.id,
        availableLimit: availableLimit,
        totalLimit: totalLimit,
        rewardPoints: rewardPoints,
        lastStatementBalance: lastStatementBalance,
      );
    }
  }
}
