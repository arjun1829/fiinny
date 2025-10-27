// lib/services/merchants/merchant_alias_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// MerchantAlias
/// - Fast, in-memory normalization for noisy gateway descriptors
/// - Optional Firestore overrides: config/merchant_alias/overrides {pattern,label}
/// - India-focused: UPI, gateways, OTT, food, travel, telecom, brokers, etc.
class MerchantAlias {
  /// Built-in regex patterns (case-insensitive) → CANONICAL LABEL (UPPERCASE).
  /// Keep these short & specific; broad terms go later in the list.
  static final Map<Pattern, String> _builtin = {
    // -------- Gateways / Aggregators / Payment wrappers --------
    RegExp(r'RAZORPAY|RAZ\*', caseSensitive: false): 'RAZORPAY',
    RegExp(r'CASHFREE', caseSensitive: false): 'CASHFREE',
    RegExp(r'PAYU(?:MONEY)?', caseSensitive: false): 'PAYU',
    RegExp(r'CCA?VENUE', caseSensitive: false): 'CCAVENUE',
    RegExp(r'BILLDESK', caseSensitive: false): 'BILLDESK',

    // -------- Wallets / Super-apps --------
    RegExp(r'PAYTM\s*WALLET|PAYTM', caseSensitive: false): 'PAYTM',
    RegExp(r'AMAZON\s*PAY', caseSensitive: false): 'AMAZON PAY',
    RegExp(r'PHONEPE|BHARATPE', caseSensitive: false): 'PHONEPE',
    RegExp(r'GOOGLE\s*PAY|G(?:OOGLE)?\s*PAY', caseSensitive: false): 'GOOGLE PAY',

    // -------- Apple/Google subscriptions --------
    RegExp(r'APPLE\.COM/BILL|APPLE\s*SERVICES?', caseSensitive: false): 'APPLE',
    RegExp(r'GOOGLE\s*\*?\s*YOUTUBE|YOUTUBE\s*PREMIUM', caseSensitive: false): 'YOUTUBE PREMIUM',

    // -------- OTT / Media / SaaS --------
    RegExp(r'NETFLIX', caseSensitive: false): 'NETFLIX',
    RegExp(r'PRIME\s*VIDEO|AMAZON\s*PRIME', caseSensitive: false): 'AMAZON PRIME',
    RegExp(r'DISNEY\+?\s*HOTSTAR|HOTSTAR', caseSensitive: false): 'HOTSTAR',
    RegExp(r'SONY\s*LIV|SONYLIV', caseSensitive: false): 'SONYLIV',
    RegExp(r'ZEE5', caseSensitive: false): 'ZEE5',
    RegExp(r'SPOTIFY', caseSensitive: false): 'SPOTIFY',
    RegExp(r'ADOBE', caseSensitive: false): 'ADOBE',
    RegExp(r'MICROSOFT', caseSensitive: false): 'MICROSOFT',

    // -------- Food / Q-commerce --------
    RegExp(r'SWIGGY', caseSensitive: false): 'SWIGGY',
    RegExp(r'ZOMATO', caseSensitive: false): 'ZOMATO',
    RegExp(r'BLINKIT', caseSensitive: false): 'BLINKIT',
    RegExp(r'ZEPTO', caseSensitive: false): 'ZEPTO',
    RegExp(r'BIGBASKET|BBNOW', caseSensitive: false): 'BIGBASKET',
    RegExp(r'DOMINOS', caseSensitive: false): 'DOMINOS',
    RegExp(r'PIZZA\s*HUT', caseSensitive: false): 'PIZZA HUT',
    RegExp(r'MCDONALD', caseSensitive: false): 'MCDONALDS',
    RegExp(r'KFC', caseSensitive: false): 'KFC',

    // -------- Shopping --------
    RegExp(r'AMAZON(?!\s*PAY)', caseSensitive: false): 'AMAZON',
    RegExp(r'FLIPKART', caseSensitive: false): 'FLIPKART',
    RegExp(r'MEESHO', caseSensitive: false): 'MEESHO',
    RegExp(r'NYKAA', caseSensitive: false): 'NYKAA',
    RegExp(r'AJIO', caseSensitive: false): 'AJIO',
    RegExp(r'DMART|D-MART', caseSensitive: false): 'DMART',

    // -------- Travel / Mobility --------
    RegExp(r'IRCTC', caseSensitive: false): 'IRCTC',
    RegExp(r'REDBUS', caseSensitive: false): 'REDBUS',
    RegExp(r'MAKEMYTRIP|MMT', caseSensitive: false): 'MAKEMYTRIP',
    RegExp(r'IXIGO', caseSensitive: false): 'IXIGO',
    RegExp(r'YATRA', caseSensitive: false): 'YATRA',
    RegExp(r'UBER', caseSensitive: false): 'UBER',
    RegExp(r'OLA', caseSensitive: false): 'OLA',
    RegExp(r'RAPIDO', caseSensitive: false): 'RAPIDO',

    // -------- Telecom / Broadband / DTH --------
    RegExp(r'JIO\s*FIBER|JIOFIBER', caseSensitive: false): 'JIOFIBER',
    RegExp(r'JIO', caseSensitive: false): 'JIO',
    RegExp(r'AIRTEL\s*X?STREAM', caseSensitive: false): 'AIRTEL XSTREAM',
    RegExp(r'AIRTEL', caseSensitive: false): 'AIRTEL',
    RegExp(r'VODAFONE|VI\b', caseSensitive: false): 'VI',
    RegExp(r'BSNL', caseSensitive: false): 'BSNL',
    RegExp(r'ACT\s*FIBER(?:NET)?', caseSensitive: false): 'ACT FIBERNET',
    RegExp(r'TATA\s*PLAY|TATASKY', caseSensitive: false): 'TATA PLAY',
    RegExp(r'SUN\s*DIRECT', caseSensitive: false): 'SUN DIRECT',
    RegExp(r'HATHWAY', caseSensitive: false): 'HATHWAY',

    // -------- Fuel --------
    RegExp(r'HPCL|HINDUSTAN PETROLEUM', caseSensitive: false): 'HPCL',
    RegExp(r'BPCL|BHARAT PETROLEUM', caseSensitive: false): 'BPCL',
    RegExp(r'IOCL|INDIAN OIL', caseSensitive: false): 'IOCL',
    RegExp(r'SHELL', caseSensitive: false): 'SHELL',
    RegExp(r'NAYARA', caseSensitive: false): 'NAYARA ENERGY',
    RegExp(r'JIO[-\s]?BP|JIOBP', caseSensitive: false): 'JIO-BP',
    RegExp(r'HP\s*PAY', caseSensitive: false): 'HPCL',
    RegExp(r'SMARTDRIVE', caseSensitive: false): 'BPCL',

    // -------- Entertainment --------
    RegExp(r'BOOKMYSHOW|BIGTREE', caseSensitive: false): 'BOOKMYSHOW',
    RegExp(r'PVR', caseSensitive: false): 'PVR',
    RegExp(r'INOX', caseSensitive: false): 'INOX',

    // -------- Investments / Brokers / MFs --------
    RegExp(r'ZERODHA', caseSensitive: false): 'ZERODHA',
    RegExp(r'GROWW', caseSensitive: false): 'GROWW',
    RegExp(r'UPSTOX', caseSensitive: false): 'UPSTOX',
    RegExp(r'ANGEL\s*(ONE)?', caseSensitive: false): 'ANGEL',
    RegExp(r'ICICI\s*DIRECT', caseSensitive: false): 'ICICI DIRECT',
    RegExp(r'PAYTM\s*MONEY', caseSensitive: false): 'PAYTM MONEY',
    RegExp(r'HDFC\s*SEC', caseSensitive: false): 'HDFC SEC',
    RegExp(r'SBI\s*MUTUAL\s*FUND', caseSensitive: false): 'SBI MUTUAL FUND',
    RegExp(r'HDFC\s*MUTUAL\s*FUND', caseSensitive: false): 'HDFC MUTUAL FUND',
    RegExp(r'AXIS\s*MUTUAL\s*FUND', caseSensitive: false): 'AXIS MUTUAL FUND',
    RegExp(r'NIPPON', caseSensitive: false): 'NIPPON',
    RegExp(r'KOTAK\s*MUTUAL\s*FUND', caseSensitive: false): 'KOTAK MUTUAL FUND',

    // -------- Generic cleanups / fallbacks --------
    RegExp(r'POS\s*[-:]*\s*', caseSensitive: false): 'POS',
    RegExp(r'ECOM|E-COM', caseSensitive: false): 'ECOM',
  };

  /// Common UPI VPA suffix → brand mapping (uppercased). Not exhaustive.
  static const Map<String, String> _upiSuffixToBrand = {
    '@ybl': 'PHONEPE',
    '@ibl': 'ICICI UPI',
    '@icici': 'ICICI UPI',
    '@okicici': 'ICICI UPI',
    '@okhdfcbank': 'HDFC UPI',
    '@hdfcbank': 'HDFC UPI',
    '@axisbank': 'AXIS UPI',
    '@okaxis': 'AXIS UPI',
    '@oksbi': 'SBI UPI',
    '@sbi': 'SBI UPI',
    '@upi': 'UPI',
    '@paytm': 'PAYTM',
    '@apl': 'AMAZON PAY',
    '@fam': 'FAMPAY',
  };

  static Map<Pattern, String>? _remote; // lazy-loaded
  static bool _loading = false;

  /// Normalize a raw merchant string into a canonical label.
  /// Backwards-compatible entry point used across parsers.
  static String normalize(String? raw) {
    final s = (raw ?? '').trim();
    if (s.isEmpty) return '';
    final upper = _cleanDecorators(s.toUpperCase());

    // 1) Remote overrides first (if warmed)
    final entries = _remote ?? _builtin;
    for (final entry in entries.entries) {
      final pat = entry.key;
      if (pat is RegExp) {
        if (pat.hasMatch(upper)) return entry.value;
      } else {
        final str = pat.toString().toUpperCase();
        if (upper.contains(str)) return entry.value;
      }
    }

    // 2) Compact punctuation & trim generic noise like "POS", "ECOM"
    final collapsed = upper.replaceAll(RegExp(r'\s+'), ' ').replaceAll('*', '').trim();
    return collapsed;
  }

  /// Context-aware normalization (optional).
  /// If `raw` yields nothing, try UPI VPA / email domain / SMS address hints.
  static String normalizeFromContext({
    String? raw,
    String? upiVpa,
    String? emailDomain,
    String? smsAddress,
  }) {
    // Try the usual path first
    final n = normalize(raw);
    if (n.isNotEmpty && n != 'POS' && n != 'ECOM') return n;

    // UPI VPA suffix mapping
    final vpa = (upiVpa ?? '').toLowerCase().trim();
    if (vpa.contains('@')) {
      final suff = vpa.substring(vpa.indexOf('@'));
      final brand = _upiSuffixToBrand[suff];
      if (brand != null && brand.isNotEmpty) return brand;
      // if no brand but a bare VPA, return VPA uppercased
      if (vpa.isNotEmpty) return vpa.toUpperCase();
    }

    // Email domain hint (e.g., statements/receipts)
    final dom = (emailDomain ?? '').toUpperCase().trim();
    if (dom.isNotEmpty) {
      // map common domains
      if (dom.contains('HDFCBANK')) return 'HDFC';
      if (dom.contains('ICICIBANK') || dom.contains('ICICI')) return 'ICICI';
      if (dom.contains('SBI')) return 'SBI';
      if (dom.contains('AXISBANK') || dom.contains('AXIS')) return 'AXIS';
      if (dom.contains('KOTAK')) return 'KOTAK';
      if (dom.contains('YESBANK') || dom.contains('YES')) return 'YES';
      if (dom.contains('AMAZON')) return 'AMAZON';
      if (dom.contains('FLIPKART')) return 'FLIPKART';
      if (dom.contains('PAYTM')) return 'PAYTM';
      if (dom.contains('PHONEPE')) return 'PHONEPE';
      if (dom.contains('GOOGLE')) return 'GOOGLE PAY';
      return dom;
    }

    // SMS sender hint (e.g., VK-HDFCBK, AX-ICICI)
    final addr = (smsAddress ?? '').toUpperCase().trim();
    if (addr.isNotEmpty) {
      if (addr.contains('HDFC')) return 'HDFC';
      if (addr.contains('ICICI')) return 'ICICI';
      if (addr.contains('SBI')) return 'SBI';
      if (addr.contains('AXIS')) return 'AXIS';
      if (addr.contains('KOTAK')) return 'KOTAK';
      if (addr.contains('YES')) return 'YES';
      return addr;
    }

    final rawUpper = (raw ?? '').toUpperCase();
    if (rawUpper.isNotEmpty) {
      const fuelAliases = <String, String>{
        'HINDUSTAN PETROLEUM': 'HPCL',
        'HPCL': 'HPCL',
        'HP PAY': 'HPCL',
        'SMARTDRIVE': 'BPCL',
        'BPCL': 'BPCL',
        'BHARAT PETROLEUM': 'BPCL',
        'IOCL': 'INDIAN OIL',
        'INDIANOIL': 'INDIAN OIL',
        'INDIAN OIL': 'INDIAN OIL',
        'SHELL': 'SHELL',
        'NAYARA': 'NAYARA ENERGY',
        'NAYARA ENERGY': 'NAYARA ENERGY',
        'JIO-BP': 'JIO-BP',
        'JIOBP': 'JIO-BP',
      };
      for (final entry in fuelAliases.entries) {
        if (rawUpper.contains(entry.key)) return entry.value;
      }
    }

    // Give back the best we had
    return n;
  }

  /// Build a stable merchantKey when merchant might be missing.
  /// e.g., prefer merchant; else last4; else bank; else 'UNKNOWN'
  static String merchantKey(String? merchant, {String? last4, String? bank}) {
    final m = (merchant ?? '').trim().toUpperCase();
    if (m.isNotEmpty) return m;
    final l4 = (last4 ?? '').trim();
    if (l4.isNotEmpty) return 'CARD $l4';
    final b = (bank ?? '').trim().toUpperCase();
    if (b.isNotEmpty) return b;
    return 'UNKNOWN';
  }

  /// Optional: pull admin-managed overrides from Firestore
  /// Collection: config/merchant_alias/overrides (docs: {'pattern':'...', 'label':'...'})
  static Future<void> warmFromRemoteOnce() async {
    if (_loading || _remote != null) return;
    _loading = true;
    try {
      final snap = await FirebaseFirestore.instance
          .collection('config')
          .doc('merchant_alias')
          .collection('overrides')
          .limit(300)
          .get(const GetOptions(source: Source.serverAndCache));
      final map = <Pattern, String>{};
      for (final d in snap.docs) {
        final p = (d.get('pattern') ?? '').toString();
        final l = (d.get('label') ?? '').toString();
        if (p.isEmpty || l.isEmpty) continue;
        // treat pattern as case-insensitive regex
        map[RegExp(p, caseSensitive: false)] = l.toUpperCase();
      }
      if (map.isNotEmpty) _remote = map;
    } catch (_) {}
    _loading = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal: strip common gateway decorators/noise from merchant strings
  // ───────────────────────────────────────────────────────────────────────────
  static String _cleanDecorators(String upper) {
    var t = upper;

    // Remove common gateway prefixes like "POS -", "ECOM -", "ONLINE -"
    t = t.replaceAll(RegExp(r'^(POS|ECOM|ONLINE|CARD|PURCHASE)\s*[-:]*\s*'), '');

    // Collapse GOOGLE*YOUTUBE → YOUTUBE PREMIUM handled by pattern above; still strip stray stars
    t = t.replaceAll('*', ' ');

    // Remove repeated whitespace & trailing punctuation
    t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
    t = t.replaceAll(RegExp(r'[-:;,\.]+$'), '');

    return t;
  }
}
