class FeeBreakup {
  final Map<String, double> fees;
  final bool hasTax;
  FeeBreakup(this.fees, this.hasTax);
}

class FeeDetector {
  static final _reMoney = RegExp(r'(?:₹|INR)\s*([0-9]+(?:\.[0-9]{1,2})?)', caseSensitive: false);
  static final _rePairs = <String, RegExp>{
    'platform': RegExp(r'\b(platform\s*fee)\b[:\s-]*', caseSensitive: false),
    'convenience': RegExp(r'\b(convenience\s*fee|conv\.?\s*fee)\b[:\s-]*', caseSensitive: false),
    'fuelSurcharge': RegExp(r'\b(fuel\s*surcharge)\b[:\s-]*', caseSensitive: false),
    'fxMarkup': RegExp(r'\b(markup|fx\s*markup|forex\s*markup)\b[:\s-]*', caseSensitive: false),
    'interest': RegExp(r'\b(finance\s*charge|interest\s*charged)\b[:\s-]*', caseSensitive: false),
    'lateFee': RegExp(r'\b(late\s*fee|delayed\s*payment\s*charge)\b[:\s-]*', caseSensitive: false),
    'tax': RegExp(r'\b(GST|IGST|CGST|SGST|tax(?:es)?)\b[:\s-]*', caseSensitive: false),
  };

  /// Parse fee/tax amounts from an invoice-like blob (email raw body / HTML stripped).
  static FeeBreakup parse(String text) {
    final t = text.replaceAll('\u00a0', ' ');
    final out = <String, double>{};
    bool hasTax = false;

    for (final kv in _rePairs.entries) {
      final key = kv.key;
      for (final m in kv.value.allMatches(t)) {
        final after = t.substring(m.end, (m.end + 40).clamp(0, t.length));
        final amt = _reMoney.firstMatch(after)?.group(1);
        if (amt != null) {
          out[key] = (double.tryParse(amt) ?? 0);
          if (key == 'tax') hasTax = true;
          break;
        }
      }
    }
    return FeeBreakup(out, hasTax);
  }
}
