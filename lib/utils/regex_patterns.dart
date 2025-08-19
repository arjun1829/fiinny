// utils/regex_patterns.dart

class RegexPatterns {
  // Transaction patterns
  static final cardTxn = RegExp(r'(?:card(?:\s*ending\s*with)?\s*(\d{4}))', caseSensitive: false);
  static final upiTxn = RegExp(r'(?:UPI.*?(\d{10,}))', caseSensitive: false);

  // Bank SMS/Email
  static final amount = RegExp(r'INR\s?([0-9,]+\.?\d*)', caseSensitive: false);
  static final credit = RegExp(r'credited with INR\s?([0-9,]+\.?\d*)', caseSensitive: false);
  static final debit = RegExp(r'debited with INR\s?([0-9,]+\.?\d*)', caseSensitive: false);

  // Date patterns (e.g., 21-Jul-2024, 2024-07-21)
  static final dateDMY = RegExp(r'(\d{2,4}[/-][A-Za-z]{3,9}[/-]\d{2,4})');
  static final dateYMD = RegExp(r'(\d{4}[/-]\d{2}[/-]\d{2})');

  // Bill/Utility
  static final bill = RegExp(r'(Electricity|Gas|Water|Phone|Internet|Rent|EMI)', caseSensitive: false);

// ...add more as needed!
}
