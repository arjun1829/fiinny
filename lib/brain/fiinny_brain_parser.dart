import 'dart:math';

class BrainResult {
  final String? category;       // e.g., "Entertainment"
  final String? label;          // e.g., "BookMyShow"
  final double confidence;      // 0..1
  final List<String> tags;      // ["fee","subscription","autopay","loan_emi","forex","fixed_income"]
  final Map<String, dynamic> meta; // feeType, feeAmount, recurringKey, merchant, fxFee, fxCurrency, fxRate

  const BrainResult({
    this.category,
    this.label,
    this.confidence = 0.0,
    this.tags = const [],
    this.meta = const {},
  });

  BrainResult merge(BrainResult other) => BrainResult(
    category: other.category ?? category,
    label: other.label ?? label,
    confidence: max(confidence, other.confidence),
    tags: {...tags, ...other.tags}.toList(),
    meta: {...meta, ...other.meta},
  );
}

class FiinnyBrainParser {
  // --- keyword banks ---
  static final _feeKw = RegExp(r'\b(fee|charge|convenience|processing|gst|markup|penalty|late)\b', caseSensitive: false);
  static final _loanKw = RegExp(r'\b(emi|loan|repayment|installment|instalment)\b', caseSensitive: false);
  static final _autopayKw = RegExp(r'\b(standing instruction|si|ecs|mandate|autopay|auto[- ]?debit)\b', caseSensitive: false);
  static final _forexKw = RegExp(r'\b(forex|fx|cross.?currency|intl|international|markup)\b', caseSensitive: false);
  static final _salaryKw = RegExp(r'\b(salary|sal\s*cr|salary credit|payroll|salary\s*neft)\b', caseSensitive: false);

  static final Map<RegExp, String> _merchantToCategory = {
    RegExp(r'\b(bigtree|bookmyshow|inoxt|pvr)\b', caseSensitive:false): 'Entertainment',
    RegExp(r'\b(zomato|swiggy|eat|blinkit|dominos|pizza hut)\b', caseSensitive:false): 'Food & Drinks',
    RegExp(r'\b(ola|uber|rapido|irctc|indian rail)\b', caseSensitive:false): 'Transport',
    RegExp(r'\b(amazon|flipkart|myntra|ajio)\b', caseSensitive:false): 'Shopping',
    RegExp(r'\b(airtel|jio|vi)\b', caseSensitive:false): 'Utilities',
    RegExp(r'\b(netflix|spotify|prime|hotstar|youtube premium|apple music)\b', caseSensitive:false): 'Subscriptions',
  };

  static BrainResult parseExpense({
    required double amount,
    required String note,
    DateTime? date,
    String? cardLast4,
    String? type,
  }) {
    final n = note.toLowerCase();

    BrainResult res = BrainResult(confidence: 0.15, meta: {'rawNote': note});

    // 1) merchant/category guess
    for (final entry in _merchantToCategory.entries) {
      if (entry.key.hasMatch(n)) {
        final m = entry.key.firstMatch(n)!;
        final merchant = m.group(0);
        res = res.merge(BrainResult(
          category: entry.value,
          label: _title(merchant ?? entry.value),
          confidence: 0.8,
          meta: {'merchant': _title(merchant ?? '')},
        ));
        break;
      }
    }

    // 2) hidden fees
    if (_feeKw.hasMatch(n)) {
      final feeAmt = _pullRupeeAmount(n); // crude extractor, refine later
      res = res.merge(BrainResult(
        tags: ['fee'],
        confidence: max(res.confidence, 0.75),
        meta: {'feeAmount': feeAmt, 'feeType': _firstWord(n, ['late','convenience','processing','gst','markup'])},
      ));
      // If only fee and nothing else, category stays as previous or "Fees & Charges"
      if (res.category == null) {
        res = res.merge(BrainResult(category: 'Fees & Charges', label: 'Bank Fee', confidence: 0.8));
      }
    }

    // 3) autopay
    if (_autopayKw.hasMatch(n)) {
      res = res.merge(BrainResult(
        tags: [...res.tags, 'autopay'],
        confidence: max(res.confidence, 0.7),
      ));
    }

    // 4) loan EMI
    if (_loanKw.hasMatch(n)) {
      res = res.merge(BrainResult(
        category: res.category ?? 'Loans',
        tags: [...res.tags, 'loan_emi'],
        confidence: max(res.confidence, 0.8),
        meta: {'loanName': _guessLoanName(n)},
      ));
    }

    // 5) forex
    if (_forexKw.hasMatch(n) || n.contains('\$') || n.contains('usd') || n.contains('eur') || n.contains('€')) {
      res = res.merge(BrainResult(
        tags: [...res.tags, 'forex', 'fee'],
        confidence: max(res.confidence, 0.8),
        meta: {'fxFee': _pullRupeeAmount(n), 'fxCurrency': _guessCurrency(n)},
      ));
      if (res.category == null) res = res.merge(BrainResult(category: 'International Spend', confidence: 0.8));
    }

    // 6) fallback category from type
    if (res.category == null && (type ?? '').isNotEmpty) {
      res = res.merge(BrainResult(category: _title(type!), confidence: max(res.confidence, 0.5)));
    }

    return res;
  }

  static BrainResult parseIncome({
    required double amount,
    required String note,
    required String source,
    DateTime? date,
  }) {
    final n = note.toLowerCase();
    BrainResult res = BrainResult(
      category: 'Income',
      label: _title(source),
      confidence: 0.4,
      meta: {'rawNote': note},
    );

    // salary / fixed income
    if (_salaryKw.hasMatch(n)) {
      res = res.merge(BrainResult(
        label: 'Salary',
        tags: ['fixed_income'],
        confidence: 0.9,
        meta: {'employer': _guessEmployer(n)},
      ));
    }

    // interest/cashback/refund quick heuristics
    if (n.contains('cashback') || n.contains('reward')) {
      res = res.merge(BrainResult(label: 'Cashback', tags: ['cashback'], confidence: 0.75));
    } else if (n.contains('refund')) {
      res = res.merge(BrainResult(label: 'Refund', tags: ['refund'], confidence: 0.75));
    } else if (n.contains('interest')) {
      res = res.merge(BrainResult(label: 'Interest', tags: ['interest'], confidence: 0.75));
    }

    return res;
  }

  // --- helpers (first pass; we’ll refine) ---
  static double? _pullRupeeAmount(String n) {
    final m = RegExp(r'(?:inr|rs\.?|₹)\s*([0-9][0-9,]*\.?\d*)').firstMatch(n);
    if (m == null) return null;
    return double.tryParse(m.group(1)!.replaceAll(',', ''));
  }

  static String? _guessCurrency(String n) {
    if (n.contains('usd') || n.contains('\$')) return 'USD';
    if (n.contains('eur') || n.contains('€')) return 'EUR';
    if (n.contains('gbp') || n.contains('£')) return 'GBP';
    return null;
    }

  static String? _guessEmployer(String n) {
    final m = RegExp(r'from\s+([a-z0-9 &._-]{3,})').firstMatch(n);
    return m?.group(1)?.trim().toUpperCase();
  }

  static String? _guessLoanName(String n) {
    final m = RegExp(r'(home|auto|personal|education)', caseSensitive:false).firstMatch(n);
    return m?.group(0)?.toUpperCase();
  }

  static String _firstWord(String n, List<String> set) =>
    set.firstWhere((w) => n.contains(w), orElse: () => 'fee');

  static String _title(String s) =>
    s.isEmpty ? s : s.split(RegExp(r'\s+')).map((w) => w.isEmpty ? w : w[0].toUpperCase()+w.substring(1)).join(' ');
}
