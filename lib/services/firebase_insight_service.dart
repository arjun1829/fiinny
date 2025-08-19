import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/insight_model.dart';
import '../models/credit_card_model.dart';
import '../models/bill_model.dart';

class FirebaseInsightService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Save a single insight
  Future<void> saveInsight(String userId, InsightModel insight) async {
    await _firestore
        .collection('insights')
        .doc('${userId}_${insight.timestamp.millisecondsSinceEpoch}')
        .set(insight.toJson());
  }

  // Fetch all insights for a user
  Future<List<InsightModel>> fetchInsights(String userId) async {
    final snapshot = await _firestore
        .collection('insights')
        .where('userId', isEqualTo: userId)
        .orderBy('timestamp', descending: true)
        .get();

    return snapshot.docs
        .map((doc) => InsightModel.fromJson(doc.data()))
        .toList();
  }

  // --- NEW: Batch-generate and save insights from cards/bills ---
  Future<void> generateAndSaveInsightsFromData({
    required String userId,
    required List<CreditCardModel> creditCards,
    required List<BillModel> bills,
  }) async {
    final List<InsightModel> insights = [];

    // --- Credit Card Dues ---
    for (final card in creditCards) {
      // Due soon (within 7 days, not paid)
      if (!card.isPaid && card.daysToDue() <= 7 && card.daysToDue() >= 0) {
        insights.add(
          InsightModel(
            title: "Credit Card Bill Due Soon",
            description:
            "${card.bankName} card ending ${card.last4Digits} has a bill of ₹${card.totalDue.toStringAsFixed(0)} due on ${card.dueDate.day}/${card.dueDate.month}.",
            type: InsightType.creditCardDue,
            timestamp: DateTime.now(),
            userId: userId,
            relatedCreditCardId: card.id,
            category: 'credit_card',
            isActionable: true,
            severity: 2,
          ),
        );
      }
      // Overdue
      if (!card.isPaid && card.isOverdue) {
        insights.add(
          InsightModel(
            title: "Credit Card Payment Overdue!",
            description:
            "Bill for ${card.bankName} card ending ${card.last4Digits} is overdue. Please pay ASAP to avoid penalty.",
            type: InsightType.overdueAlert,
            timestamp: DateTime.now(),
            userId: userId,
            relatedCreditCardId: card.id,
            category: 'credit_card',
            isActionable: true,
            severity: 3,
          ),
        );
      }
    }

    // --- Bill Dues ---
    for (final bill in bills) {
      if (!bill.isPaid && bill.daysToDue() <= 7 && bill.daysToDue() >= 0) {
        insights.add(
          InsightModel(
            title: "Upcoming Bill Due",
            description:
            "${bill.name} bill of ₹${bill.amount.toStringAsFixed(0)} due on ${bill.dueDate.day}/${bill.dueDate.month}.",
            type: InsightType.billDue,
            timestamp: DateTime.now(),
            userId: userId,
            relatedBillId: bill.id,
            category: bill.billType,
            isActionable: true,
            severity: 2,
          ),
        );
      }
      if (!bill.isPaid && bill.isOverdue) {
        insights.add(
          InsightModel(
            title: "Bill Overdue!",
            description:
            "${bill.name} bill of ₹${bill.amount.toStringAsFixed(0)} is overdue. Please pay to avoid service disruption.",
            type: InsightType.overdueAlert,
            timestamp: DateTime.now(),
            userId: userId,
            relatedBillId: bill.id,
            category: bill.billType,
            isActionable: true,
            severity: 3,
          ),
        );
      }
    }

    // --- Save all generated insights to Firestore ---
    for (final insight in insights) {
      await saveInsight(userId, insight);
    }
  }

  // Optionally: Delete all insights for a user (e.g., before regeneration)
  Future<void> deleteAllInsightsForUser(String userId) async {
    final snapshot = await _firestore
        .collection('insights')
        .where('userId', isEqualTo: userId)
        .get();
    for (final doc in snapshot.docs) {
      await doc.reference.delete();
    }
  }
}
