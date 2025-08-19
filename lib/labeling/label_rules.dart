class LabelRules {
  static String categoryFor({
    required String channel, // UPI | Card-POS | Card-ECOM | ATM | NetBanking | CreditCardBill
    required String merchantNorm,
    required String noteLower,
  }) {
    if (channel.startsWith('Card')) return 'Card Spend';
    if (channel == 'UPI') {
      if (noteLower.contains('rent')) return 'Rent';
      if (merchantNorm.contains('ZOMATO') || merchantNorm.contains('SWIGGY')) return 'Food & Dining';
      return 'UPI';
    }
    if (channel == 'ATM') return 'ATM Withdrawal';
    if (channel == 'CreditCardBill') return 'Credit Card Bill';

    // Heuristics
    if (noteLower.contains('fuel') || noteLower.contains('petrol') || noteLower.contains('bharat petroleum')) {
      return 'Fuel';
    }
    if (noteLower.contains('uber') || noteLower.contains('ola')) return 'Transport';
    if (noteLower.contains('electricity') || noteLower.contains('bill')) return 'Utilities';
    return 'Other';
  }

  static List<String> tags({
    String? bankCode,
    String? scheme,
    String? cardLast4,
    required String channel,
  }) {
    final t = <String>[channel];
    if (bankCode != null && bankCode.isNotEmpty) t.add(bankCode);
    if (scheme != null && scheme.isNotEmpty) t.add(scheme);
    if (cardLast4 != null && cardLast4.isNotEmpty) t.add('****$cardLast4');
    return t;
  }
}
