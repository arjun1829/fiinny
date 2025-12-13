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
  /// Canonical taxonomy (main category → subcategories)
  /// 1. Fund Transfers → {Fund Transfers - Others, Cash Withdrawals, Remittance}
  /// 2. Payments → {Loans/EMIs, Fuel, Mobile bill, Auto Service, Bills / Utility,
  ///    Credit card, Logistics, Payment others, Rental and realestate, Wallet payment}
  /// 3. Shopping → {groceries and consumables, electronics, apparel,
  ///    books and stationery, ecommerce, fitness, gift,
  ///    home furnishing and gaming, jewellery and accessories,
  ///    personal care, shopping others}
  /// 4. Travel → {car rental, travel and tours, travel others, accommodation,
  ///    airlines, cab/bike services, forex, railways}
  /// 5. Food → {restaurants, alcohol, food delivery, food others}
  /// 6. Entertainment → {OTT services, gaming, movies, music,
  ///    entertainment others}
  /// 7. Others → {others, business services, bank charges, cheque reject,
  ///    government services, Tax payments}
  /// 8. Healthcare → {medicine/pharma, healthcare others, hospital}
  /// 9. Education → {Education}
  /// 10. Investments → {Mutual Fund – SIP, Mutual Fund – Lumpsum,
  ///     Stocks / Brokerage, Investments – Others}

  // -------------------- Canonical map --------------------
  // brand/keyword -> [category, subcategory, tags]
  static const Map<String, List<dynamic>> _brandMap = {
    // OTT & Subscriptions
    'NETFLIX': ['Entertainment', 'OTT services', ['ott','subscription']],
    'AMAZON PRIME': ['Entertainment', 'OTT services', ['ott','subscription']],
    'PRIME VIDEO': ['Entertainment', 'OTT services', ['ott','subscription']],
    'HOTSTAR': ['Entertainment', 'OTT services', ['ott','subscription']],
    'DISNEY+ HOTSTAR': ['Entertainment', 'OTT services', ['ott','subscription']],
    'SONYLIV': ['Entertainment', 'OTT services', ['ott','subscription']],
    'ZEE5': ['Entertainment', 'OTT services', ['ott','subscription']],
    'SPOTIFY': ['Entertainment', 'music', ['music','subscription']],
    'YOUTUBE PREMIUM': ['Entertainment', 'OTT services', ['ott','subscription']],
    'APPLE.COM/BILL': ['Entertainment', 'entertainment others', ['apple','subscription']],
    'APPLE': ['Entertainment', 'entertainment others', ['apple','subscription']],
    'ADOBE': ['Payments', 'Payment others', ['saas','subscription']],
    'MICROSOFT': ['Payments', 'Payment others', ['saas','subscription']],
    'OPENAI': ['Payments', 'Payment others', ['saas','subscription']],
    'CHATGPT': ['Payments', 'Payment others', ['saas','subscription']],

    // Telecom / Internet / DTH
    'JIO': ['Payments', 'Mobile bill', ['telecom']],
    'AIRTEL': ['Payments', 'Mobile bill', ['telecom']],
    'VI': ['Payments', 'Mobile bill', ['telecom']],
    'BSNL': ['Payments', 'Mobile bill', ['telecom']],
    'HATHWAY': ['Payments', 'Bills / Utility', ['broadband']],
    'ACT FIBERNET': ['Payments', 'Bills / Utility', ['broadband']],
    'JIOFIBER': ['Payments', 'Bills / Utility', ['broadband']],
    'AIRTEL XSTREAM': ['Payments', 'Bills / Utility', ['broadband']],
    'TATA PLAY': ['Payments', 'Bills / Utility', ['dth']],
    'SUN DIRECT': ['Payments', 'Bills / Utility', ['dth']],

    // Food & Groceries
    'ZOMATO': ['Food', 'food delivery', ['food']],
    'SWIGGY': ['Food', 'food delivery', ['food']],
    'DOMINOS': ['Food', 'restaurants', ['food']],
    'MCDONALD': ['Food', 'restaurants', ['food']],
    'KFC': ['Food', 'restaurants', ['food']],
    'BIGBASKET': ['Shopping', 'groceries and consumables', ['groceries']],
    'BLINKIT': ['Shopping', 'groceries and consumables', ['groceries']],
    'ZEPTO': ['Shopping', 'groceries and consumables', ['groceries']],
    'DMART': ['Shopping', 'groceries and consumables', ['groceries']],

    // Shopping
    'AMAZON': ['Shopping', 'ecommerce', ['shopping']],
    'FLIPKART': ['Shopping', 'ecommerce', ['shopping']],
    'MYNTRA': ['Shopping', 'apparel', ['shopping']],
    'AJIO': ['Shopping', 'apparel', ['shopping']],
    'MEESHO': ['Shopping', 'ecommerce', ['shopping']],
    'NYKAA': ['Shopping', 'personal care', ['shopping']],
    'TATA CLIQ': ['Shopping', 'ecommerce', ['shopping']],
    'IKEA': ['Shopping', 'home furnishing and gaming', ['furniture', 'shopping']],

    // Travel & Transport
    'IRCTC': ['Travel', 'railways', ['travel']],
    'REDBUS': ['Travel', 'travel and tours', ['travel']],
    'MAKEMYTRIP': ['Travel', 'travel and tours', ['travel']],
    'YATRA': ['Travel', 'travel and tours', ['travel']],
    'IXIGO': ['Travel', 'travel and tours', ['travel']],
    'INDIGO': ['Travel', 'airlines', ['travel']],
    'VISTARA': ['Travel', 'airlines', ['travel']],
    'AIR INDIA': ['Travel', 'airlines', ['travel']],
    'OLA': ['Travel', 'cab/bike services', ['mobility']],
    'UBER': ['Travel', 'cab/bike services', ['mobility']],
    'RAPIDO': ['Travel', 'cab/bike services', ['mobility']],

    // Entertainment
    'BOOKMYSHOW': ['Entertainment', 'movies', ['entertainment']],
    'BIGTREE': ['Entertainment', 'movies', ['entertainment']],
    'PVR': ['Entertainment', 'movies', ['entertainment']],
    'INOX': ['Entertainment', 'movies', ['entertainment']],

    // Healthcare
    'APOLLO': ['Healthcare', 'medicine/pharma', ['health']],
    '1MG': ['Healthcare', 'medicine/pharma', ['health']],
    'PHARMEASY': ['Healthcare', 'medicine/pharma', ['health']],

    // Education
    'BYJUS': ['Education', 'Education', ['education']],
    'UNACADEMY': ['Education', 'Education', ['education']],

    // Fuel
    'HPCL': ['Payments', 'Fuel', ['fuel']],
    'BPCL': ['Payments', 'Fuel', ['fuel']],
    'IOCL': ['Payments', 'Fuel', ['fuel']],

    // Investments / Brokers / MFs
    'ZERODHA': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'GROWW': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'UPSTOX': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'ANGEL': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'PAYTM MONEY': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'ICICI DIRECT': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'HDFC SEC': ['Investments', 'Stocks / Brokerage', ['investments','brokerage']],
    'SBI MUTUAL FUND': ['Investments', 'Mutual Fund – Lumpsum', ['investments','mf']],
    'HDFC MUTUAL FUND': ['Investments', 'Mutual Fund – Lumpsum', ['investments','mf']],
    'AXIS MUTUAL FUND': ['Investments', 'Mutual Fund – Lumpsum', ['investments','mf']],
    'NIPPON': ['Investments', 'Mutual Fund – Lumpsum', ['investments','mf']],
    'KOTAK MUTUAL FUND': ['Investments', 'Mutual Fund – Lumpsum', ['investments','mf']],
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
      return const CategoryGuess('Payments', 'Payment others', 0.9, ['subscription','autopay']);
    }

    // EMI / Loans
    if (_has(t, r'\b(EMI|LOAN|NACH|ECS|MANDATE)\b') || tags.contains('loan_emi')) {
      return const CategoryGuess('Payments', 'Loans/EMIs', 0.9, ['loan_emi']);
    }

    // Fees & Charges
    if (_has(t, r'\b(convenience\s*fee|gst|markup|surcharge|penalty|late\s*fee|processing\s*fee|charge)\b') ||
        tags.contains('fee') || tags.contains('charges')) {
      final ccish = _has(t, r'\b(credit\s*card|cc\s*txn|cc\s*transaction|visa|mastercard|rupay|amex|diners)\b');
      if (ccish) {
        return const CategoryGuess('Payments', 'Credit card', 0.85, ['fee','bank charges']);
      }
      return const CategoryGuess('Others', 'bank charges', 0.85, ['fee','bank charges']);
    }

    // UPI transfers
    if ((instrument ?? '').toUpperCase().contains('UPI') || _has(t, r'\b(UPI|VPA)\b')) {
      return const CategoryGuess('Fund Transfers', 'Fund Transfers - Others', 0.8, ['upi']);
    }

    // Credit card bill payment acknowledgements
    if (_has(t, r'\b(credit\s*card).*(bill|due|payment)\b') ||
        _has(t, r'\b(statement|total\s*due|min(imum)?\s*due|due\s*date)\b')) {
      return const CategoryGuess('Payments', 'Credit card', 0.85, ['bill','credit card']);
    }

    // Recharges / DTH / Telecom
    if (_has(t, r'\b(recharge|prepaid|dth|pack|data\s*pack|mobile\s*bill)\b')) {
      return const CategoryGuess('Payments', 'Mobile bill', 0.8, ['telecom','recharge']);
    }

    // Utilities (Electricity/Water/Gas)
    if (_has(t, r'\b(bill\s*payment|electric(ity)?|water\s*bill|gas\s*bill|power\s*bill|mseb|bescom|tneb|bses|torrent|adani|tata\s*power)\b')) {
      return const CategoryGuess('Payments', 'Bills / Utility', 0.75, ['utilities']);
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
      return const CategoryGuess('Payments', 'Fuel', 0.95, ['fuel','transport']);
    }

    // Travel / Tickets / Hotels
    final travelHit = _has(t, r'\b(irctc|redbus|yatra|ixigo|makemytrip|flight|air(?:line)?|hotel|booking\.com|train|railway|railways|bus|visa)\b');
    if (travelHit) {
      if (_has(t, r'\b(train|railway|railways|irctc)\b')) {
        return const CategoryGuess('Travel', 'railways', 0.8, ['travel']);
      }
      if (_has(t, r'\b(flight|air(?:line)?|indigo|vistara|air india|airasia|spicejet)\b')) {
        return const CategoryGuess('Travel', 'airlines', 0.8, ['travel']);
      }
      if (_has(t, r'\b(hotel|stay|booking\.com|oyo|airbnb|resort)\b')) {
        return const CategoryGuess('Travel', 'accommodation', 0.8, ['travel']);
      }
      if (_has(t, r'\b(ola|uber|rapido|meru|cab|taxi|bike\s*ride)\b')) {
        return const CategoryGuess('Travel', 'cab/bike services', 0.75, ['travel']);
      }
      return const CategoryGuess('Travel', 'travel others', 0.75, ['travel']);
    }

    // Food
    if (_has(t, r'\b(zomato|swiggy|restaurant|dine|meal|kitchen|caf[eé]|bistro|hotel\s*restaurant)\b')) {
      if (_has(t, r'\b(zomato|swiggy)\b')) {
        return const CategoryGuess('Food', 'food delivery', 0.8, ['food']);
      }
      return const CategoryGuess('Food', 'restaurants', 0.75, ['food']);
    }

    // Groceries
    if (_has(t, r'\b(grocery|kirana|bigbasket|dmart|mart|fresh|hypermarket|supermarket|ration)\b')) {
      return const CategoryGuess('Shopping', 'groceries and consumables', 0.75, ['groceries']);
    }

    // Shopping
    if (_has(t, r'\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata\s*cliq|snapdeal|firstcry|lenskart)\b')) {
      return const CategoryGuess('Shopping', 'ecommerce', 0.8, ['shopping']);
    }

    // Investments / SIP / Mutual Funds / Brokers / Depository
    final hasSipCue = detectSip(text);
    final hasMfCue = _has(t, r'\b(mutual\s*fund|mf|nav|amc|folio)\b');
    final hasBrokerCue = _has(t, r'\b(zerodha|groww|upstox|icici\s*direct|angel|paytm\s*money|hdfc\s*sec|kotak\s*securities)\b');
    final hasDepositoryCue = _has(t, r'\b(cdsl|nsdl|demat|brokerage)\b');
    if (hasSipCue || hasMfCue || hasBrokerCue || hasDepositoryCue) {
      if (hasSipCue) {
        return const CategoryGuess('Investments', 'Mutual Fund – SIP', 0.9, ['investments','mf','sip']);
      }
      if (hasMfCue) {
        return const CategoryGuess('Investments', 'Mutual Fund – Lumpsum', 0.85, ['investments','mf']);
      }
      return const CategoryGuess('Investments', 'Stocks / Brokerage', 0.85, ['investments','brokerage']);
    }

    // Health
    if (_has(t, r'\b(hospital|clinic|pharma|apollopharmacy|pharmeasy|1mg|diagnostic|medical|pharmacy)\b')) {
      if (_has(t, r'\b(hospital|clinic|diagnostic)\b')) {
        return const CategoryGuess('Healthcare', 'hospital', 0.75, ['health']);
      }
      return const CategoryGuess('Healthcare', 'medicine/pharma', 0.75, ['health']);
    }

    // Education
    if (_has(t, r'\b(fee\s*payment|college|tuition|coaching|byjus|unacademy|school|exam|univ)\b')) {
      return const CategoryGuess('Education', 'Education', 0.7, ['education']);
    }

    // Entertainment / Movies / Events
    if (_has(t, r'\b(movie|pvr|inox|bookmyshow|concert|event|ticket|festival|theatre)\b')) {
      return const CategoryGuess('Entertainment', 'movies', 0.7, ['entertainment']);
    }

    // Transfers generic (IMPS/NEFT/RTGS)
    if (_has(t, r'\b(imps|neft|rtgs)\b')) {
      return const CategoryGuess('Fund Transfers', 'Fund Transfers - Others', 0.7, ['transfer']);
    }

    // International hints
    if (_has(t, r'\b(international|foreign|fx|forex)\b')) {
      return const CategoryGuess('Travel', 'forex', 0.6, ['international','forex']);
    }

    // Fallback
    return const CategoryGuess('Others', 'others', 0.3, []);
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
    return _has(t, r'\b(SIP|SYSTEMATIC\s*INVESTMENT|S\.I\.P\.)\b');
  }

  // -------------------- Internals --------------------
  static bool _has(String t, String pattern) => RegExp(pattern, caseSensitive: false).hasMatch(t);
}
