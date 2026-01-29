enum TransactionClass {
  income,
  expense,
  transferSelf, // Internal movement (Savings -> Savings)
  repayment, // Liability settlement (Savings -> Credit Card/Loan)
  investment, // Savings -> Investment (technically asset transfer)
}

class TransactionClassifier {
  static const List<String> _selfKeywords = [
    'self',
    'own account',
    'internal transfer',
    'sweep',
    'auto sweep'
  ];

  static const List<String> _repaymentKeywords = [
    'credit card payment',
    'cms', // common for card payments
    'bill desk',
    'repayment',
    'loan account',
    'emi',
    'installments'
  ];

  /// Classifies a transaction based on loose heuristics.
  /// [text]: The raw SMS/Email body or normalized text.
  /// [sender]: The sender of the message (header).
  /// [amount]: Transaction amount.
  /// [type]: 'debit' or 'credit'.
  static TransactionClass classify({
    required String text,
    required String type, // 'debit' or 'credit'
    String? sender,
    String? counterparty,
  }) {
    final lowerText = text.toLowerCase();
    final lowerCp = (counterparty ?? '').toLowerCase();

    // 1. REPAYMENTS (Credit Card Bills, Loans)
    if (_matchesAny(lowerText, _repaymentKeywords) ||
        _matchesAny(lowerCp, _repaymentKeywords)) {
      // If it's a DEBIT from Bank, it's a Repayment (Liability decreases).
      // If it's a CREDIT to Card, it's also a Repayment (Liability decreases).
      return TransactionClass.repayment;
    }

    // 2. SELF TRANSFERS
    if (_matchesAny(lowerText, _selfKeywords) ||
        _matchesAny(lowerCp, _selfKeywords)) {
      return TransactionClass.transferSelf;
    }

    // 3. DEFAULT
    if (type == 'credit') {
      return TransactionClass.income;
    } else {
      return TransactionClass.expense;
    }
  }

  static bool _matchesAny(String text, List<String> keywords) {
    if (text.isEmpty) return false;
    for (final k in keywords) {
      if (text.contains(k)) return true;
    }
    return false;
  }
}
