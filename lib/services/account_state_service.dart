import '../models/bank_account_model.dart';
import '../models/credit_card_model.dart';
import '../models/loan_model.dart';
import 'bank_account_service.dart';
import 'credit_card_service.dart';
import 'loan_service.dart';

class AccountStateService {
  AccountStateService._();
  static final AccountStateService instance = AccountStateService._();

  final BankAccountService _bankService = BankAccountService();
  final CreditCardService _cardService = CreditCardService();
  final LoanService _loanService = LoanService();

  // ---------------------------------------------------------------------------
  // BANK ACCOUNTS
  // ---------------------------------------------------------------------------

  /// Updates (or creates) a bank account balance state.
  Future<void> updateBankBalance({
    required String userId,
    required String bankName,
    required String last4,
    required double balance,
  }) async {
    final existing = await _bankService.findAccount(userId, bankName, last4);
    if (existing != null) {
      // Update existing
      await _bankService.updateBalance(userId, existing.id, balance);
    } else {
      // Create new
      final newAccount = BankAccountModel(
        id: '${bankName}_$last4', // specific ID format
        bankName: bankName,
        last4Digits: last4,
        currentBalance: balance,
        balanceUpdatedAt: DateTime.now(),
        accountType: 'Savings', // Default assumption
      );
      await _bankService.saveAccount(userId, newAccount);
    }
  }

  // ---------------------------------------------------------------------------
  // CREDIT CARDS
  // ---------------------------------------------------------------------------

  /// Updates credit card state (Outstanding, Limit, etc.)
  Future<void> updateCreditCardState({
    required String userId,
    required String bankName,
    required String last4,
    double? currentOutstanding,
    double? availableLimit,
    double? totalLimit,
  }) async {
    // Rely on CreditCardService's fuzzy matcher
    await _cardService.updateCardMetadataByMatch(
      userId,
      bankName: bankName,
      last4: last4,
      availableLimit: availableLimit,
      totalLimit: totalLimit,
      // We need to extend CreditCardService to accept currentOutstanding
      // For now, we'll implement a custom logic here if service doesn't support it directly
      // Or better, update CreditCardService to handle it.
      // Assuming we added currentBalance logic to CreditCardService or Model
    );

    // Since I added currentBalance to CreditCardModel but didn't explicitly add it to
    // updateCardMetadataByMatch signature in CreditCardService, I might need to fix that service.
    // For now, let's look up the card and update it manually if needed, or rely on a fix.

    // Let's implement a manual lookup and update here to be safe and robust
    final cards = await _cardService.getUserCards(userId);
    final match = cards.cast<CreditCardModel?>().firstWhere(
          (c) =>
              c != null &&
              c.bankName.toUpperCase() == bankName.toUpperCase() &&
              c.last4Digits == last4,
          orElse: () => null,
        );

    if (match != null) {
      final updates = <String, dynamic>{};
      if (currentOutstanding != null) {
        updates['currentBalance'] = currentOutstanding;
        updates['balanceUpdatedAt'] = DateTime.now().toIso8601String();
      }
      if (availableLimit != null) updates['availableCredit'] = availableLimit;
      if (totalLimit != null) updates['creditLimit'] = totalLimit;
      if ((availableLimit != null || totalLimit != null)) {
        updates['limitUpdatedAt'] = DateTime.now().toIso8601String();
      }

      if (updates.isNotEmpty) {
        await _cardService.saveCard(
            userId,
            match.copyWith(
              currentBalance: updates['currentBalance'],
              availableCredit: updates['availableCredit'],
              creditLimit: updates['creditLimit'],
              balanceUpdatedAt: updates['balanceUpdatedAt'] != null
                  ? DateTime.parse(updates['balanceUpdatedAt'])
                  : null,
              limitUpdatedAt: updates['limitUpdatedAt'] != null
                  ? DateTime.parse(updates['limitUpdatedAt'])
                  : null,
            ));
      }
    } else {
      // Option: Auto-create Credit Card if strict evidence found?
      // User request: "Maintain a credit card account... Update this state whenever... new relevant SMS/email is received"
      // So yes, auto-creation is implied.
      if (currentOutstanding != null || availableLimit != null) {
        final newCard = CreditCardModel(
          id: '${bankName}_$last4',
          bankName: bankName,
          cardType: 'Credit Card',
          last4Digits: last4,
          cardholderName: '', // Unknown
          dueDate: DateTime.now()
              .add(const Duration(days: 30)), // Temporary placeholder
          totalDue: 0,
          minDue: 0,
          currentBalance: currentOutstanding,
          availableCredit: availableLimit,
          creditLimit: totalLimit,
          balanceUpdatedAt: DateTime.now(),
        );
        await _cardService.saveCard(userId, newCard);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // LOANS
  // ---------------------------------------------------------------------------

  /// Updates loan state (EMI paid, Remaining Principal)
  Future<void> updateLoanState({
    required String userId,
    required String bankName, // Lender
    double? emiPaidAmount,
    double? outstandingPrincipal,
  }) async {
    // Loan matching is harder without detailed IDs.
    // We'll try to match by Lender Name and rough amount if possible, or just Lender Name.
    // If explicit outstandingPrincipal is given, it's a strong signal.

    final loans = await _loanService.getLoans(userId);
    // Try to find active loan from this lender
    final match = loans.cast<LoanModel?>().firstWhere(
          (l) =>
              l != null &&
              !l.isClosed &&
              (l.lenderName ?? l.lenderType)
                  .toUpperCase()
                  .contains(bankName.toUpperCase()),
          orElse: () => null,
        );

    if (match != null) {
      final updates = <String, dynamic>{};
      if (outstandingPrincipal != null) {
        updates['outstandingPrincipal'] = outstandingPrincipal;
        updates['balanceUpdatedAt'] = DateTime.now(); // will be converted
      }

      if (emiPaidAmount != null) {
        // Heuristic: Increment total paid
        final currentTotal = match.totalPaid ?? 0;
        updates['totalPaid'] = currentTotal + emiPaidAmount;

        final currentCount = match.emIsPaidCount ?? 0;
        updates['emIsPaidCount'] = currentCount + 1;

        // If we don't have explicit outstanding, but we know the EMI and original amount, we could Estimate.
        // But explicit is better. For now just tracking payments.
      }

      if (updates.isNotEmpty) {
        await _loanService.patch(match.id!, updates);
      }
    }
  }
}
