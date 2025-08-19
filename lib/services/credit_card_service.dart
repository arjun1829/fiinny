import '../models/credit_card_model.dart';

class CreditCardService {
  // List all user's cards (can be from Firestore/local)
  Future<List<CreditCardModel>> getUserCards(String userId) async {
    // TODO: implement fetch from Firestore/local storage
    return [];
  }

  // Add or update a card
  Future<void> saveCard(String userId, CreditCardModel card) async {
    // TODO: implement add/update logic
  }

  // Mark a bill as paid
  Future<void> markCardBillPaid(String userId, String cardId, DateTime paidDate) async {
    // TODO: implement mark as paid logic
  }

  // Delete a card
  Future<void> deleteCard(String userId, String cardId) async {
    // TODO: implement deletion logic
  }
}
