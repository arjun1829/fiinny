import '../../models/parsed_transaction.dart';

class CommonRegex {
  static final _amount = RegExp(r'(?:INR|Rs\.?|₹|\$|USD|EUR|GBP|AED)\s?([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
  static final _last4 = RegExp(r'(?:ending|xx|XXXX|last\s?digits?|last\s?4)\s?(\d{4})', caseSensitive: false);
  static final _upi = RegExp(r'\b([\w\.\-_]+)@[\w\.\-_]+\b');
  
  // Updated: Added ANY ERRORS protection
  static final _merchantAfter = RegExp(r"\b(?:at|to|for)\s+(?!ANY\s+ERRORS)([A-Za-z0-9 &().@'_\-]{2,60})");
  
  static final _merchantNameStrict = RegExp(
    r'Merchant Name\s*[:\-]?\s*([A-Za-z0-9 &().@''_\-]{2,60})',
    caseSensitive: false,
  );

  static final _paidToExplicit = RegExp(
    r'\b(PAID\s+TO|PAYMENT\s+TO|TO)\b\s*[:\-]?\s*(?!ANY\s+ERRORS)([A-Za-z0-9][A-Za-z0-9 .&\-\(\)+]{1,40})',
    caseSensitive: false,
  );

  static final _upiP2mTail = RegExp(
    r'\bUPI\/P2[AM]\/[^\/\s]+\/([^\/\n\r]+)',
    caseSensitive: false,
  );

  static final _credit = RegExp(
    r'(credited|amount\s*credited|received|rcvd|deposit|refund|reversal|cashback|interest\s+credited)',
    caseSensitive: false,
  );
  static final _debit = RegExp(
    r'(debited|amount\s*debited|spent|purchase|paid|payment|withdrawn|transferred|deducted|autopay|emi|ATM)',
    caseSensitive: false,
  );

  // Quick match list for known brands (aligned with SmsIngestor)
  static final _knownBrands = <String>[
    'OPENAI','NETFLIX','AMAZON PRIME','PRIME VIDEO','SPOTIFY','YOUTUBE','GOOGLE *YOUTUBE',
    'APPLE.COM/BILL','APPLE','MICROSOFT','ADOBE','SWIGGY','ZOMATO','HOTSTAR','DISNEY+ HOTSTAR',
    'SONYLIV','AIRTEL','JIO','VI','HATHWAY','ACT FIBERNET','BOOKMYSHOW','BIGTREE','OLA','UBER',
    'IRCTC','REDBUS','AMAZON','FLIPKART','MEESHO','BLINKIT','ZEPTO','STARBUCKS','DMART'
  ];

  static int? extractAmountPaise(String text) {
    final m = _amount.firstMatch(text);
    if (m == null) return null;
    final n = double.tryParse((m.group(1) ?? '').replaceAll(',', ''));
    return n == null ? null : (n * 100).round();
  }

  static String extractInstrumentHint(String text) {
    final last4 = _last4.firstMatch(text)?.group(1);
    if (last4 != null) return 'CARD:$last4';
    final vpa = _upi.firstMatch(text)?.group(0);
    if (vpa != null) {
      final core = vpa.split('@').first;
      return 'UPI:${core.toLowerCase()}';
    }
    return '';
  }

  static TxChannel detectChannel(String text) {
    final t = text.toLowerCase();
    if (t.contains('upi')) return TxChannel.upi;
    if (t.contains('credit card') || t.contains('debit card') || t.contains('card ')) return TxChannel.card;
    if (t.contains('neft') || t.contains('imps') || t.contains('rtgs')) return TxChannel.bank;
    if (t.contains('wallet') || t.contains('paytm') || t.contains('amazon pay')) return TxChannel.wallet;
    if (t.contains('atm')) return TxChannel.atm;
    return TxChannel.unknown;
  }

  static bool isCredit(String text) => _credit.hasMatch(text);
  static bool isDebit(String text) => _debit.hasMatch(text);

  static String? extractPaidToName(String text) {
    final upper = text.toUpperCase();

    final m1 = _paidToExplicit.firstMatch(upper);
    if (m1 != null) {
      final v = (m1.group(2) ?? '').trim();
      if (v.isNotEmpty && !v.startsWith('ANY ERRORS')) return v;
    }

    final m2 = _upiP2mTail.firstMatch(upper);
    if (m2 != null) {
      final raw = (m2.group(1) ?? '').trim();
      if (raw.isNotEmpty) return raw;
    }

    return null;
  }

  static String? extractMerchant(String text) {
    // 0) Check known brands first (High confidence, fast)
    final upperArgs = text.toUpperCase();
    for (final k in _knownBrands) {
      if (upperArgs.contains(k)) return k;
    }

    // 1) Explicit "Merchant Name:"
    final mExplicit = _merchantNameStrict.firstMatch(text);
    if (mExplicit != null) {
       final name = mExplicit.group(1)?.trim();
       if (name != null && name.isNotEmpty) return name;
    }

    // 2) Paid To / UPI P2M
    final paidTo = extractPaidToName(text);
    if (paidTo != null && paidTo.isNotEmpty) {
      return paidTo;
    }
    
    // 3) Fallback: 'at|to|for' <something>
    final m = _merchantAfter.firstMatch(text);
    final fallback = m?.group(1)?.trim();
    if (fallback != null && fallback.startsWith('ANY ERRORS')) return null; // Double check
    return fallback;
  }

  static DateTime? parseDateFromHeader(String hdr) {
    return null;
  }

  static String categoryHint(String text) {
    final t = text.toLowerCase();
    if (t.contains('fuel') || t.contains('petrol')) return 'Fuel';
    if (t.contains('zomato') || t.contains('swiggy') || t.contains('restaurant')) return 'Food';
    if (t.contains('irctc') || t.contains('uber') || t.contains('ola') || t.contains('air')) return 'Travel';
    if (t.contains('electricity') || t.contains('bill') || t.contains('dth')) return 'Bills';
    if (t.contains('salary')) return 'Salary';
    if (isCredit(text)) return 'Income';
    return 'Other';
  }

  static double confidenceScore({
    required bool hasAmount,
    required bool hasInstrument,
    required bool hasMerchant,
    required bool channelKnown,
  }) {
    double s = 0;
    if (hasAmount) s += 0.40;
    if (hasInstrument) s += 0.25;
    if (hasMerchant) s += 0.20;
    if (channelKnown) s += 0.15;
    return s.clamp(0, 1);
  }
}
