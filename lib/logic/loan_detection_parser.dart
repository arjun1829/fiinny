enum LoanType { given, taken }

class LoanParseResult {
  final double amount;
  final LoanType type;
  final String? counterPartyName;
  final double confidence;

  LoanParseResult({
    required this.amount,
    required this.type,
    this.counterPartyName,
    this.confidence = 1.0,
  });
}

class LoanDetectionParser {
  // Regex: Matches 500, 1,000, 500.50, and 500/- (common in India)
  static final RegExp _amountRegex = RegExp(
      r'(?:Rs\.?|INR|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)(?:/-)?',
      caseSensitive: false);

  static final List<String> _givenKeywords = [
    'lent',
    'gave',
    'paid for',
    'credit to',
    'sent to',
    'owes me'
  ];
  static final List<String> _takenKeywords = [
    'borrowed',
    'took',
    'received from',
    'credit from',
    'i owe'
  ];

  static LoanParseResult? parse(String text) {
    if (text.isEmpty) return null;
    try {
      final cleanText = text.trim();
      final lowerText = cleanText.toLowerCase();

      final amountMatch = _amountRegex.firstMatch(cleanText);
      if (amountMatch == null) return null;

      final String amountString = amountMatch.group(1)!.replaceAll(',', '');
      final double amount = double.tryParse(amountString) ?? 0.0;
      if (amount == 0) return null;

      LoanType? detectedType;
      String matchedKeyword = '';

      for (final keyword in _givenKeywords) {
        if (lowerText.contains(keyword)) {
          detectedType = LoanType.given;
          matchedKeyword = keyword;
          break;
        }
      }
      if (detectedType == null) {
        for (final keyword in _takenKeywords) {
          if (lowerText.contains(keyword)) {
            detectedType = LoanType.taken;
            matchedKeyword = keyword;
            break;
          }
        }
      }

      if (detectedType == null) return null;

      String? name;
      try {
        final keywordIndex = lowerText.indexOf(matchedKeyword);
        final afterKeyword =
            cleanText.substring(keywordIndex + matchedKeyword.length).trim();
        final words = afterKeyword.split(RegExp(r'\s+'));
        final potentialNameParts = <String>[];
        for (var word in words) {
          // Stop at numbers or amount symbols
          if (word.contains(RegExp(r'\d')) ||
              word.contains('₹') ||
              word.length < 2) continue;
          if (potentialNameParts.length >= 2) break;
          potentialNameParts.add(word);
        }
        if (potentialNameParts.isNotEmpty) {
          // Capitalize Name
          name = potentialNameParts
              .map((s) => s[0].toUpperCase() + s.substring(1))
              .join(' ');
        }
      } catch (_) {}

      return LoanParseResult(
          amount: amount, type: detectedType, counterPartyName: name);
    } catch (e) {
      return null;
    }
  }
}
