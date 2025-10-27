// lib/services/categorization/category_rules.dart

/// Lightweight, deterministic categorizer tailored for India.
/// - Works with noisy SMS/Gmail text + a normalized merchantKey
/// - Backwards-compatible: same return type and method name.
/// - NEW: richer brand map, SIP/EMI/fees/subscription cues, UPI & card logic.
/// - Optional named params let callers pass extra hints (instrument/tags) without breaking.
///
/// Usage (existing):
///   final g = CategoryRules.categorizeMerchant(text, merchantKey);
///
/// Optional (new, non-breaking):
///   final g = CategoryRules.categorizeMerchant(text, merchantKey,
///       instrument: 'UPI', tags: ['international','fee']);
class CategoryGuess {
  final String category;     // e.g. "Shopping"
  final String subcategory;  // e.g. "Marketplace"
  final double confidence;   // 0..1
  final List<String> tags;   // normalized tags
  const CategoryGuess(this.category, this.subcategory, this.confidence, this.tags);
}

class CategoryRules {
  // -------------------- Canonical map --------------------
  // brand/keyword -> [category, subcategory, tags]
  static const Map<String, List<dynamic>> _brandMap = {
    // OTT & Subscriptions
    'NETFLIX': ['Subscriptions', 'OTT', ['ott','subscription']],
    'AMAZON PRIME': ['Subscriptions', 'OTT', ['ott','subscription']],
    'PRIME VIDEO': ['Subscriptions', 'OTT', ['ott','subscription']],
    'HOTSTAR': ['Subscriptions', 'OTT', ['ott','subscription']],
    'DISNEY+ HOTSTAR': ['Subscriptions', 'OTT', ['ott','subscription']],
    'SONYLIV': ['Subscriptions', 'OTT', ['ott','subscription']],
    'ZEE5': ['Subscriptions', 'OTT', ['ott','subscription']],
    'SPOTIFY': ['Subscriptions', 'Music', ['music','subscription']],
    'YOUTUBE PREMIUM': ['Subscriptions', 'OTT', ['ott','subscription']],
    'APPLE.COM/BILL': ['Subscriptions', 'Apps', ['apple','subscription']],
    'APPLE': ['Subscriptions', 'Apps', ['apple','subscription']],
    'ADOBE': ['Subscriptions', 'SaaS', ['saas','subscription']],
    'MICROSOFT': ['Subscriptions', 'SaaS', ['saas','subscription']],

    // Telecom / Internet / DTH
    'JIO': ['Utilities', 'Telecom', ['telecom']],
    'AIRTEL': ['Utilities', 'Telecom', ['telecom']],
    'VI': ['Utilities', 'Telecom', ['telecom']],
    'BSNL': ['Utilities', 'Telecom', ['telecom']],
    'HATHWAY': ['Utilities', 'Broadband', ['broadband']],
    'ACT FIBERNET': ['Utilities', 'Broadband', ['broadband']],
    'JIOFIBER': ['Utilities', 'Broadband', ['broadband']],
    'AIRTEL XSTREAM': ['Utilities', 'Broadband', ['broadband']],
    'TATA PLAY': ['Utilities', 'DTH', ['dth']],
    'SUN DIRECT': ['Utilities', 'DTH', ['dth']],

    // Food & Groceries
    'ZOMATO': ['Food & Drink', 'Delivery', ['food']],
    'SWIGGY': ['Food & Drink', 'Delivery', ['food']],
    'DOMINOS': ['Food & Drink', 'Restaurants', ['food']],
    'MCDONALD': ['Food & Drink', 'Restaurants', ['food']],
    'KFC': ['Food & Drink', 'Restaurants', ['food']],
    'BIGBASKET': ['Groceries', 'Delivery', ['groceries']],
    'BLINKIT': ['Groceries', 'Quick Commerce', ['groceries']],
    'ZEPTO': ['Groceries', 'Quick Commerce', ['groceries']],
    'DMART': ['Groceries', 'Hypermarket', ['groceries']],

    // Shopping
    'AMAZON': ['Shopping', 'Marketplace', ['shopping']],
    'FLIPKART': ['Shopping', 'Marketplace', ['shopping']],
    'MYNTRA': ['Shopping', 'Fashion', ['shopping']],
    'AJIO': ['Shopping', 'Fashion', ['shopping']],
    'MEESHO': ['Shopping', 'Marketplace', ['shopping']],
    'NYKAA': ['Shopping', 'Beauty', ['shopping']],
    'TATA CLIQ': ['Shopping', 'Marketplace', ['shopping']],

    // Travel & Transport
    'IRCTC': ['Travel', 'Rail', ['travel']],
    'REDBUS': ['Travel', 'Bus', ['travel']],
    'MAKEMYTRIP': ['Travel', 'Agency', ['travel']],
    'YATRA': ['Travel', 'Agency', ['travel']],
    'IXIGO': ['Travel', 'Agency', ['travel']],
    'INDIGO': ['Travel', 'Air', ['travel']],
    'VISTARA': ['Travel', 'Air', ['travel']],
    'AIR INDIA': ['Travel', 'Air', ['travel']],
    'OLA': ['Transport', 'Ride-hailing', ['mobility']],
    'UBER': ['Transport', 'Ride-hailing', ['mobility']],
    'RAPIDO': ['Transport', 'Ride-hailing', ['mobility']],

    // Entertainment
    'BOOKMYSHOW': ['Entertainment', 'Events', ['entertainment']],
    'BIGTREE': ['Entertainment', 'Events', ['entertainment']],
    'PVR': ['Entertainment', 'Movies', ['entertainment']],
    'INOX': ['Entertainment', 'Movies', ['entertainment']],

    // Health
    'APOLLO': ['Health', 'Pharmacy/Clinic', ['health']],
    '1MG': ['Health', 'Pharmacy', ['health']],
    'PHARMEASY': ['Health', 'Pharmacy', ['health']],

    // Education
    'BYJUS': ['Education', 'Online', ['education']],
    'UNACADEMY': ['Education', 'Online', ['education']],

    // Fuel
    'HPCL': ['Fuel', 'Fuel', ['fuel']],
    'BPCL': ['Fuel', 'Fuel', ['fuel']],
    'IOCL': ['Fuel', 'Fuel', ['fuel']],

    // Investments / Brokers / MFs
    'ZERODHA': ['Investments', 'Brokerage', ['investments','brokerage']],
    'GROWW': ['Investments', 'Brokerage', ['investments','brokerage']],
    'UPSTOX': ['Investments', 'Brokerage', ['investments','brokerage']],
    'ANGEL': ['Investments', 'Brokerage', ['investments','brokerage']],
    'PAYTM MONEY': ['Investments', 'Brokerage', ['investments','brokerage']],
    'ICICI DIRECT': ['Investments', 'Brokerage', ['investments','brokerage']],
    'HDFC SEC': ['Investments', 'Brokerage', ['investments','brokerage']],
    'SBI MUTUAL FUND': ['Investments', 'Mutual Funds', ['investments','mf']],
    'HDFC MUTUAL FUND': ['Investments', 'Mutual Funds', ['investments','mf']],
    'AXIS MUTUAL FUND': ['Investments', 'Mutual Funds', ['investments','mf']],
    'NIPPON': ['Investments', 'Mutual Funds', ['investments','mf']],
    'KOTAK MUTUAL FUND': ['Investments', 'Mutual Funds', ['investments','mf']],
  };

  // -------------------- Public API (backward compatible) --------------------
  static CategoryGuess categorizeMerchant(
      String text,
      String? merchantKey, {
        String? instrument,          // optional hint: UPI / Credit Card / ...
        List<String> tags = const [],// optional extra tags from parser (e.g., ['international','fee','loan_emi'])
      }) {
    final combined = (text + ' ' + (merchantKey ?? '')).trim();
    final t = combined.toUpperCase();
    final lower = combined.toLowerCase();
    final merchantUpper = (merchantKey ?? '').toUpperCase();

    // 1) Direct brand hits
    for (final k in _brandMap.keys) {
      if (t.contains(k)) {
        final v = _brandMap[k]!;
        return CategoryGuess(
          v[0] as String,                    // category
          v[1] as String,                    // subcategory
          1.0,                               // confidence
          List<String>.from(v[2] as List),   // tags
        );
      }
    }

    // 2) Heuristics by cues / tags / instrument
    // Subscriptions / Autopay
    if (_has(t, r'\b(auto[-\s]?debit|autopay|subscription|renew(al)?|membership|plan)\b') ||
        tags.contains('subscription')) {
      return const CategoryGuess('Subscriptions', 'General', 0.9, ['subscription','autopay']);
    }

    // EMI / Loans
    if (_has(t, r'\b(EMI|LOAN|NACH|ECS|MANDATE)\b') || tags.contains('loan_emi')) {
      final lender = detectLoanLender(text) ?? 'Loan';
      return CategoryGuess('EMI & Loans', lender, 0.9, ['loan_emi']);
    }

    // Fees & Charges
    if (_has(t, r'\b(convenience\s*fee|gst|markup|surcharge|penalty|late\s*fee|processing\s*fee|charge)\b') ||
        tags.contains('fee') || tags.contains('charges')) {
      // If this looks card-specific, mark as Credit Card Charges; else generic.
      final ccish = _has(t, r'\b(credit\s*card|cc\s*txn|cc\s*transaction|visa|mastercard|rupay|amex|diners)\b');
      return CategoryGuess(
        ccish ? 'Credit Cards' : 'Fees & Charges',
        ccish ? 'Card Charges' : 'General',
        0.85,
        ['fee'],
      );
    }

    // UPI transfers
    if ((instrument ?? '').toUpperCase().contains('UPI') || _has(t, r'\b(UPI|VPA)\b')) {
      // If words like salary/refund present -> may still be income/expense specific.
      return const CategoryGuess('Transfers', 'UPI', 0.8, ['upi']);
    }

    // Credit card bill payment acknowledgements
    if (_has(t, r'\b(credit\s*card).*(bill|due|payment)\b') ||
        _has(t, r'\b(statement|total\s*due|min(imum)?\s*due|due\s*date)\b')) {
      return const CategoryGuess('Credit Cards', 'Bill', 0.85, ['bill','credit_card_bill']);
    }

    // Recharges / DTH / Telecom
    if (_has(t, r'\b(recharge|prepaid|dth|pack|data\s*pack|mobile\s*bill)\b')) {
      return const CategoryGuess('Utilities', 'Telecom', 0.8, ['telecom','recharge']);
    }

    // Utilities (Electricity/Water/Gas)
    if (_has(t, r'\b(bill\s*payment|electric(ity)?|water\s*bill|gas\s*bill|power\s*bill|mseb|bescom|tneb|bses|torrent|adani|tata\s*power)\b')) {
      return const CategoryGuess('Utilities', 'Bills', 0.75, ['utilities']);
    }

    // Fuel (petrol/diesel pumps + brand aliases)
    final fuelHit = RegExp(r'\b(petrol|diesel|fuel|gas\s*station|filling\s*station)\b')
            .hasMatch(lower) ||
        lower.contains('hpcl') ||
        lower.contains('hindustan petroleum') ||
        lower.contains('bpcl') ||
        lower.contains('bharat petroleum') ||
        lower.contains('iocl') ||
        lower.contains('indian oil') ||
        lower.contains('shell') ||
        lower.contains('nayara') ||
        lower.contains('jio-bp') ||
        lower.contains('jiobp') ||
        lower.contains('smartdrive') ||
        lower.contains('hp pay') ||
        merchantUpper.contains('HPCL') ||
        merchantUpper.contains('BPCL') ||
        merchantUpper.contains('HINDUSTAN PETROLEUM') ||
        merchantUpper.contains('BHARAT PETROLEUM') ||
        merchantUpper.contains('IOCL') ||
        merchantUpper.contains('INDIAN OIL') ||
        merchantUpper.contains('SHELL') ||
        merchantUpper.contains('NAYARA') ||
        merchantUpper.contains('JIO-BP');
    if (fuelHit) {
      return const CategoryGuess('Fuel', 'Petrol/Diesel', 0.95, ['fuel', 'transport']);
    }

    // Travel / Tickets / Hotels
    if (_has(t, r'\b(irctc|redbus|yatra|ixigo|makemytrip|flight|air(?:line)?|hotel|booking\.com)\b')) {
      return const CategoryGuess('Travel', 'General', 0.8, ['travel']);
    }

    // Food
    if (_has(t, r'\b(zomato|swiggy|restaurant|dine|meal|kitchen|caf[eé])\b')) {
      return const CategoryGuess('Food & Drink', 'General', 0.75, ['food']);
    }

    // Groceries
    if (_has(t, r'\b(grocery|kirana|bigbasket|dmart|mart|fresh)\b')) {
      return const CategoryGuess('Groceries', 'General', 0.75, ['groceries']);
    }

    // Shopping
    if (_has(t, r'\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata\s*cliq)\b')) {
      return const CategoryGuess('Shopping', 'Marketplace', 0.8, ['shopping']);
    }

    // Investments / SIP / Mutual Funds / Brokers / Depository
    if (_has(t, r'\b(sip|systematic\s*investment|mutual\s*fund|mf|nav|amc|folio)\b') ||
        _has(t, r'\b(zerodha|groww|upstox|icici\s*direct|angel|paytm\s*money)\b') ||
        _has(t, r'\b(cdsl|nsdl|demat|brokerage)\b')) {
      return const CategoryGuess('Investments', 'Mutual Funds / Stocks', 0.85, ['investments','sip']);
    }

    // Health
    if (_has(t, r'\b(hospital|clinic|pharma|apollopharmacy|pharmeasy|1mg|diagnostic)\b')) {
      return const CategoryGuess('Health', 'General', 0.75, ['health']);
    }

    // Education
    if (_has(t, r'\b(fee\s*payment|college|tuition|coaching|byjus|unacademy)\b')) {
      return const CategoryGuess('Education', 'General', 0.7, ['education']);
    }

    // Entertainment / Movies / Events
    if (_has(t, r'\b(movie|pvr|inox|bookmyshow|concert|event|ticket)\b')) {
      return const CategoryGuess('Entertainment', 'General', 0.7, ['entertainment']);
    }

    // Transfers generic (IMPS/NEFT/RTGS)
    if (_has(t, r'\b(imps|neft|rtgs)\b')) {
      return const CategoryGuess('Transfers', 'Bank Transfer', 0.7, ['transfer']);
    }

    // International hints
    if (_has(t, r'\b(international|foreign|fx|forex)\b')) {
      return const CategoryGuess('Travel', 'International', 0.6, ['international','forex']);
    }

    // Fallback
    return const CategoryGuess('Uncategorized', 'General', 0.3, []);
  }

  // -------------------- Secondary detectors (public) --------------------

  /// Heuristic detection of subscription brand for UI badges / linking.
  static String? detectSubscriptionBrand(String text) {
    final t = text.toUpperCase();
    if (_has(t, r'\b(auto[-\s]?debit|autopay|subscription|renew(al)?|membership|plan)\b')) {
      for (final k in _brandMap.keys) {
        if (t.contains(k)) return k;
      }
      // generic
      return 'SUBSCRIPTION';
    }
    return null;
  }

  /// Recognize lenders in EMI/LOAN contexts (used by RecurringEngine).
  static String? detectLoanLender(String text) {
    final t = text.toUpperCase();
    if (!_has(t, r'\b(EMI|LOAN|NACH|ECS|MANDATE)\b')) return null;
    for (final l in [
      'HDFC','ICICI','AXIS','KOTAK','IDFC','SBI','BAJAJ','HDB','TATA CAPITAL','HOME CREDIT','INDUSIND','YES','FEDERAL','BOB'
    ]) {
      if (t.contains(l)) return l;
    }
    return 'LOAN';
  }

  /// Detect mutual fund SIP cues (brand-agnostic).
  static bool detectSip(String text) {
    final t = text.toUpperCase();
    return _has(t, r'\b(SIP|SYSTEMATIC\s*INVESTMENT|MUTUAL\s*FUND|AMC|NAV|FOLIO)\b');
  }

  // -------------------- Internals --------------------
  static bool _has(String t, String pattern) => RegExp(pattern, caseSensitive: false).hasMatch(t);
}
