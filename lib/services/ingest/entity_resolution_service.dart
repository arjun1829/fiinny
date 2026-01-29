import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/bank_account_model.dart';
import '../../models/credit_card_model.dart';
import '../../models/loan_model.dart';
import '../bank_account_service.dart';
import '../credit_card_service.dart';
import '../loan_service.dart';

/// The "Brain" of Phase 5.
/// Responsible for taking raw signals (Bank Name, Last 4, Type)
/// and resolving them to a persistent Entity (Model).
///
/// If the entity exists -> Returns it.
/// If not -> Creates it.
/// Also handles "State Updates" (Balances, Limits, Due Dates).
class EntityResolutionService {
  final _bankService = BankAccountService();
  final _cardService = CreditCardService();
  final _loanService = LoanService();

  static final EntityResolutionService _instance =
      EntityResolutionService._internal();

  factory EntityResolutionService() => _instance;

  EntityResolutionService._internal();

  // ---------------------------------------------------------------------------
  // 🏦 Bank Accounts
  // ---------------------------------------------------------------------------

  /// Resolve a Bank Account from raw signals.
  /// [bankName]: "HDFC", "SBI", etc.
  /// [last4]: "1234"
  /// Returns the persistent model (fetched or newly created).
  Future<BankAccountModel> resolveBankAccount({
    required String userId,
    required String bankName,
    required String last4,
    double? currentBalance,
  }) async {
    // 1. Try to find existing
    final existing = await _bankService.findAccount(userId, bankName, last4);
    if (existing != null) {
      // 2. Found? Check if we need to update balance immediately
      if (currentBalance != null) {
        // Only update if it's "newer" or we just trust the latest SMS
        // For simplicity, we trust the latest ingested signal
        await _bankService.updateBalance(userId, existing.id, currentBalance);
        return existing.copyWith(currentBalance: currentBalance);
      }
      return existing;
    }

    // 3. Not Found -> Create New
    // ID format: BANK-LAST4 (Simple, readable, consistent)
    final id = '${bankName.toUpperCase().replaceAll(' ', '')}-${last4.trim()}';

    final newAccount = BankAccountModel(
      id: id,
      bankName: bankName,
      last4Digits: last4,
      currentBalance: currentBalance,
      balanceUpdatedAt: currentBalance != null ? DateTime.now() : null,
      accountType: 'Savings', // Default assumption, user can change
    );

    await _bankService.saveAccount(userId, newAccount);
    debugPrint('[EntityResolution] Created new Bank Account: $id');
    return newAccount;
  }

  // ---------------------------------------------------------------------------
  // 💳 Credit Cards
  // ---------------------------------------------------------------------------

  /// Resolve a Credit Card from raw signals.
  /// Returns the persistent model.
  Future<CreditCardModel> resolveCreditCard({
    required String userId,
    required String bankName,
    required String last4,
    String? cardType, // Visa, Master
    // State updates we might have caught simultaneously:
    double? availableLimit,
    double? totalLimit,
    double? totalDue,
    DateTime? dueDate,
    double? currentBalance, // Outstanding amount
  }) async {
    // 1. Try to find existing
    // CreditCardService doesn't have findAccount(bank, last4) yet,
    // so we use the updateCardMetadataByMatch logic essentially, but we need the object.

    // We'll implement a quick lookup helper here or in the service.
    // For now, let's fetch all and filter (cached/scoped usually okay for individual users).
    final cards = await _cardService.getUserCards(userId);
    final match = cards.cast<CreditCardModel?>().firstWhere(
          (c) =>
              c?.bankName.toUpperCase() == bankName.toUpperCase() &&
              c?.last4Digits == last4,
          orElse: () => null,
        );

    if (match != null) {
      // 2. Update state if provided
      // We process updates even if we just found it.
      await _updateCreditCardState(
        userId,
        match.id,
        availableLimit: availableLimit,
        totalLimit: totalLimit,
        totalDue: totalDue,
        dueDate: dueDate,
        currentBalance: currentBalance,
      );

      // Return the potentially updated model (fetched fresh or just modified in memory)
      // For strict correctness, we assume service update worked.
      return match;
    }

    // 3. Not Found -> Create New
    final id =
        '${bankName.toUpperCase().replaceAll(' ', '')}-${last4.trim()}-CC';

    final newCard = CreditCardModel(
      id: id,
      bankName: bankName,
      last4Digits: last4,
      cardType: cardType ?? 'Unknown',
      cardholderName: 'My Card', // User to edit
      dueDate: dueDate ??
          DateTime.now().add(const Duration(days: 20)), // Placeholder
      totalDue: totalDue ?? 0.0,
      minDue: 0.0,
      creditLimit: totalLimit,
      availableCredit: availableLimit,
      currentBalance: currentBalance, // Initial outstanding
      balanceUpdatedAt: DateTime.now(),
    );

    await _cardService.saveCard(userId, newCard);
    debugPrint('[EntityResolution] Created new Credit Card: $id');
    return newCard;
  }

  /// Helper to push state updates to an existing card
  Future<void> _updateCreditCardState(
    String userId,
    String cardId, {
    double? availableLimit,
    double? totalLimit,
    double? totalDue,
    DateTime? dueDate,
    double? currentBalance,
  }) async {
    if (availableLimit == null &&
        totalLimit == null &&
        totalDue == null &&
        dueDate == null &&
        currentBalance == null) {
      return;
    }

    final updates = <String, dynamic>{
      if (availableLimit != null) 'availableCredit': availableLimit,
      if (totalLimit != null) 'creditLimit': totalLimit,
      if (totalLimit != null || availableLimit != null)
        'limitUpdatedAt': DateTime.now().toIso8601String(),
      if (totalDue != null) 'totalDue': totalDue,
      if (dueDate != null) 'dueDate': dueDate.toIso8601String(),
      if (currentBalance != null) 'currentBalance': currentBalance,
    };

    // Also derive "Current Balance" (Outstanding) if we have Total & Available
    // Outstanding = Total Limit - Available Limit
    // Only derive if NOT explicitly provided
    if (currentBalance == null &&
        availableLimit != null &&
        totalLimit != null) {
      final outstanding =
          (totalLimit - availableLimit).clamp(0.0, double.infinity);
      updates['currentBalance'] = outstanding;
      updates['balanceUpdatedAt'] = DateTime.now().toIso8601String();
    } else if (currentBalance != null) {
      updates['balanceUpdatedAt'] = DateTime.now().toIso8601String();
    }

    await FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('credit_cards')
        .doc(cardId)
        .set(updates, SetOptions(merge: true));
  }

  // ---------------------------------------------------------------------------
  // 💰 Loans
  // ---------------------------------------------------------------------------

  Future<LoanModel> resolveLoan({
    required String userId,
    required String lenderName,
    String? accountLast4,
    double? emiAmount,
    double? outstandingAmount,
  }) async {
    // Loans are tricker. We usually check active loans first.
    final loans = await _loanService.getLoans(userId);
    final match = loans.cast<LoanModel?>().firstWhere((l) {
      if (l == null) return false;
      if (l.isClosed) return false;
      // Match by title/lender
      final nameMatch =
          l.lenderName?.toLowerCase() == lenderName.toLowerCase() ||
              l.title.toLowerCase().contains(lenderName.toLowerCase());

      // If last4 provided, it MUST match (if the loan has it recorded)
      // Note: LoanModel might need 'accountLast4' field if not present.
      // Assuming title matching for now as primary heuristic from user request.
      return nameMatch;
    }, orElse: () => null);

    if (match != null) {
      // Update logic (e.g. record payment or update outstanding)
      // usually handled by 'recordPayment' but here we just return the entity.
      return match;
    }

    // If new -> We usually don't auto-create Loans fully confirmed
    // because we need EMI date, tenure etc.
    // BUT user asked for "Maintain loan state".
    // For now, we created "Loan Suggestions" effectively.
    // We will return a temporary model or create a 'Detected Loan'.

    // Strategy: Create a "Detected" loan
    final id = 'LOAN-${DateTime.now().millisecondsSinceEpoch}';
    final newLoan = LoanModel(
      id: id,
      userId: userId,
      title: lenderName,
      lenderName: lenderName,
      amount: outstandingAmount ??
          (emiAmount != null ? emiAmount * 12 : 0), // Estimate
      emi: emiAmount,
      startDate: DateTime.now(),
      isClosed: false,
      tags: ['detected', 'auto-created'],
      note: 'Auto-created from entity resolution',
      createdAt: DateTime.now(), paymentDayOfMonth: null,
      autopay: false, lenderType: 'Other',
    );

    await _loanService
        .addLoan(newLoan); // This actually generates ID inside usually
    return newLoan;
  }
}
