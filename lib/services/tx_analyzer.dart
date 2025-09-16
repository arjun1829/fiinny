// lib/services/tx_analyzer.dart
// ------------------------------------------------------------
// Unified parsing + categorization for SMS and Gmail (suggestion-first).
// - Extracts amount, date, merchant, channel hints from raw text
// - Uses Google ML Kit Entity Extraction when available (optional)
// - Falls back to robust regex if ML Kit not present / fails
// - Produces a suggested category + confidence (no auto-commit)
// - Supports per-user overrides (merchant -> category)
//
// Usage (suggestion mode):
// final analyzer = TxAnalyzer(
//   config: TxAnalyzerConfig(
//     enableMlKit: true,
//     autoApproveThreshold: 0.90, // we won't use this to auto-write yet
//     minHighPrecisionConf: 0.88,
//     userOverrides: {/* "BOOKMYSHOW": "Entertainment/Movies" */},
//   ),
// );
// final res = await analyzer.analyze(
//   rawText: smsOrEmailText,
//   emailDomain: fromDomain, // e.g. "bookmyshow.com" (gmail path)
//   channel: ChannelHint(isDebit: true, isUPI: true, isP2M: true), // optional
// );
// -> res.parse (amount/date/merchant/...)
// -> res.category.category (suggested) + res.category.confidence + reasons
//
// Show a "Looks like X (92%)" chip; only write `category` on user confirm.

import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart' show kIsWeb;

// ML Kit is optional. If you don't want it, set enableMlKit=false in config.
// On web, ML Kit won't run; we automatically fall back to regex.
import 'package:google_mlkit_entity_extraction/google_mlkit_entity_extraction.dart';

/// High-level output you’ll use in your pipelines.
class TxAnalysis {
  final TxParseResult parse;     // extracted amount/date/merchant refs
  final CategoryGuess category;  // chosen category + confidence + reasons
  const TxAnalysis({required this.parse, required this.category});
}

/// What we extracted from raw text.
class TxParseResult {
  final double? amount;
  final DateTime? when;
  final String? merchant;              // best canonical merchant picked
  final List<String> merchantAliases;  // raw candidates we spotted
  final bool isDebit;
  final bool isUPI;
  final bool isP2M;
  final String raw;                    // normalized text
  final String? reference;             // UPI ref / txn id if we saw one

  const TxParseResult({
    required this.amount,
    required this.when,
    required this.merchant,
    required this.merchantAliases,
    required this.isDebit,
    required this.isUPI,
    required this.isP2M,
    required this.raw,
    this.reference,
  });

  TxParseResult copyWith({
    double? amount,
    DateTime? when,
    String? merchant,
    List<String>? merchantAliases,
    bool? isDebit,
    bool? isUPI,
    bool? isP2M,
    String? raw,
    String? reference,
  }) {
    return TxParseResult(
      amount: amount ?? this.amount,
      when: when ?? this.when,
      merchant: merchant ?? this.merchant,
      merchantAliases: merchantAliases ?? this.merchantAliases,
      isDebit: isDebit ?? this.isDebit,
      isUPI: isUPI ?? this.isUPI,
      isP2M: isP2M ?? this.isP2M,
      raw: raw ?? this.raw,
      reference: reference ?? this.reference,
    );
  }
}

/// Final category + confidence + explanation
class CategoryGuess {
  final String category;              // e.g., "Entertainment/Movies"
  final double confidence;            // 0..1
  final Map<String, double> reasons;  // {signalName: weight}
  const CategoryGuess(this.category, this.confidence, this.reasons);
}

/// Optional channel hints you already know (from parser context)
class ChannelHint {
  final bool isDebit; // true=debit, false=credit
  final bool isUPI;
  final bool isP2M;   // UPI to merchant
  const ChannelHint({required this.isDebit, this.isUPI = false, this.isP2M = false});
}

/// Analyzer configuration
class TxAnalyzerConfig {
  /// Turn ML Kit based entity extraction on/off. (Web doesn’t support MLKit.)
  final bool enableMlKit;

  /// Minimum confidence to consider “auto-approved” (unused for now).
  final double autoApproveThreshold;

  /// If a high-precision rule (merchant/domain) hits, enforce at-least this conf.
  final double minHighPrecisionConf;

  /// Hard negatives (phrases we ignore when deciding)
  final List<RegExp> negativePhrases;

  /// User micro-rules: merchant (canonical or raw uppercased) -> category
  final Map<String, String> userOverrides;

  // ✅ non-const ctor; use initializer for defaults
  TxAnalyzerConfig({
    this.enableMlKit = true,
    this.autoApproveThreshold = 0.90, // bumped from 0.75
    this.minHighPrecisionConf = 0.88, // bumped from 0.82
    List<RegExp>? negativePhrases,
    this.userOverrides = const {},
  }) : negativePhrases = negativePhrases ?? _kDefaultNegativePhrases;

  // default negative phrases (not const; RegExp isn’t const-constructible)
  static final List<RegExp> _kDefaultNegativePhrases = <RegExp>[
    RegExp(r'\bAVAILABLE (?:CREDIT|LIMIT|BAL(?:ANCE)?)\b', caseSensitive: false),
    RegExp(r'\bOTP\b', caseSensitive: false),
    RegExp(r'\bKYC\b', caseSensitive: false),
  ];

  TxAnalyzerConfig copyWith({
    bool? enableMlKit,
    double? autoApproveThreshold,
    double? minHighPrecisionConf,
    List<RegExp>? negativePhrases,
    Map<String, String>? userOverrides,
  }) {
    return TxAnalyzerConfig(
      enableMlKit: enableMlKit ?? this.enableMlKit,
      autoApproveThreshold: autoApproveThreshold ?? this.autoApproveThreshold,
      minHighPrecisionConf: minHighPrecisionConf ?? this.minHighPrecisionConf,
      negativePhrases: negativePhrases ?? this.negativePhrases,
      userOverrides: userOverrides ?? this.userOverrides,
    );
  }
}

class TxAnalyzer {
  TxAnalyzer({TxAnalyzerConfig? config}) : _cfg = config ?? TxAnalyzerConfig();
  final TxAnalyzerConfig _cfg;

  // -----------------------
  // Public entrypoints
  // -----------------------

  /// Analyze generic text (SMS or email). Provide hints if you have them.
  ///
  /// [emailDomain] helps for Gmail (e.g. swiggy.in, bookmyshow.com)
  /// [channel] helps categorize transfers vs merchant spend; overrides detection
  Future<TxAnalysis> analyze({
    required String rawText,
    String? emailDomain,
    ChannelHint? channel,
  }) async {
    final norm = _norm(rawText);

    // 1) Extract fields (MLKit + regex fallback)
    var extracted = await _extract(norm);

    // 1b) Apply explicit channel overrides if provided
    if (channel != null) {
      extracted = extracted.copyWith(
        isDebit: channel.isDebit,
        isUPI: channel.isUPI,
        isP2M: channel.isP2M,
      );
    }

    // 2) Apply user overrides (merchant->category)
    final overrideCat = _matchUserOverride(extracted.merchant, extracted.merchantAliases);
    if (overrideCat != null) {
      final guess = _finalizeCategory(
        overrideCat,
        reasons: {'userOverride': 0.95},
        highPrecision: true,
      );
      return TxAnalysis(parse: extracted, category: guess);
    }

    // 3) Categorize using layered rules (merchant/domain/keywords/channel)
    final guess = _categorize(
      text: norm,
      parse: extracted,
      emailDomain: emailDomain,
    );

    return TxAnalysis(parse: extracted, category: guess);
  }

  /// Helper if you only want category (we still extract internally).
  Future<CategoryGuess> categorizeOnly({
    required String rawText,
    String? emailDomain,
    ChannelHint? channel,
  }) async {
    final res = await analyze(rawText: rawText, emailDomain: emailDomain, channel: channel);
    return res.category;
  }

  // -----------------------
  // Extraction
  // -----------------------

  Future<TxParseResult> _extract(String norm) async {
    double? amount;
    DateTime? when;
    String? reference;
    final aliases = <String>{};

    bool isUPI = norm.contains(RegExp(r'\bUPI\b'));
    bool isP2M = norm.contains(RegExp(r'\bUPI\/P2M\b'));
    bool isDebit = _looksLikeDebit(norm);

    // A) ML Kit (optional)
    // A) ML Kit (optional)
    if (_cfg.enableMlKit && !kIsWeb) {
      try {
        final extractor = EntityExtractor(language: EntityExtractorLanguage.english);
        final annotations = await extractor.annotateText(norm);
        await extractor.close();

        for (final ann in annotations) {
          for (final ent in ann.entities) {
            switch (ent.type) {
              case EntityType.money:
                amount ??= _pickBestAmount(ann.text) ?? amount;
                break;
              case EntityType.dateTime:
                when ??= _parseDateLoose(ann.text) ?? when;
                break;
              default:
                break;
            }
          }
        }
      } catch (_) {
        // ignore ML Kit errors; regex fallback below handles it
      }
    }


    // B) Regex fallback/extras
    amount ??= _findAmount(norm);
    when ??= _findDate(norm);
    reference ??= _findUpiRef(norm);

    // C) Merchant candidates from patterns (UPI/P2M/.../MERCHANT, "AT <PLACE>", domains)
    aliases.addAll(_findMerchants(norm));

    // Canonicalize best merchant
    final canonical = _canonicalizeMerchant(aliases.toList());

    return TxParseResult(
      amount: amount,
      when: when,
      merchant: canonical,
      merchantAliases: aliases.toList(),
      isDebit: isDebit,
      isUPI: isUPI,
      isP2M: isP2M,
      raw: norm,
      reference: reference,
    );
  }

  // -----------------------
  // Categorization (layered)
  // -----------------------

  CategoryGuess _categorize({
    required String text,
    required TxParseResult parse,
    String? emailDomain,
  }) {
    final reasons = <String, double>{};
    String? category;

    // Hard negatives reduce confidence / early exit if only info
    for (final neg in _cfg.negativePhrases) {
      if (neg.hasMatch(text)) {
        // Information-only message; if no money found, bail
        if (parse.amount == null) {
          return _finalizeCategory(
            fallbackCategory(parse.isDebit),
            reasons: {'negativeInfo': 0.15},
            highPrecision: false,
          );
        }
      }
    }

    // 1) High-precision: Merchant map
    final mHit = _merchantCategory(parse.merchant, parse.merchantAliases);
    if (mHit != null) {
      category = mHit;
      reasons['merchant'] = 0.90;
    }

    // 2) High-precision: Email domain map
    if (category == null && emailDomain != null) {
      final domCat = _emailDomainCategory(emailDomain.toUpperCase());
      if (domCat != null) {
        category = domCat; reasons['domain'] = 0.80;
      }
    }

    // 3) Keyword rules
    if (category == null) {
      final kwCat = _keywordCategory(text);
      if (kwCat != null) {
        category = kwCat; reasons['keyword'] = 0.60;
      }
    }

    // 4) Channel hints
    if (category == null) {
      if (parse.isUPI && parse.isP2M && parse.isDebit) {
        category = 'Merchants/UPI'; reasons['channel'] = 0.45;
      } else if (parse.isUPI && !parse.isP2M) {
        category = parse.isDebit ? 'Transfers/Sent' : 'Transfers/Received';
        reasons['channel'] = 0.45;
      }
    }

    // 5) Amount-based small nudge
    if (category == null && parse.amount != null) {
      reasons['amountShape'] = 0.05;
    }

    // If still nothing, drop to uncategorized bucket
    category ??= fallbackCategory(parse.isDebit);

    // Confidence fusion & calibration
    final highPrecision = reasons.keys.any((k) => k == 'merchant' || k == 'domain');
    return _finalizeCategory(category, reasons: reasons, highPrecision: highPrecision);
  }

  CategoryGuess _finalizeCategory(
      String category, {
        required Map<String, double> reasons,
        required bool highPrecision,
      }) {
    // Confidence fusion: 1 - Π(1 - w_i)
    double fused = 0.0;
    if (reasons.isNotEmpty) {
      double prod = 1.0;
      for (final w in reasons.values) {
        final cw = w.clamp(0.0, 0.99);
        prod *= (1.0 - cw);
      }
      fused = (1.0 - prod).clamp(0.0, 0.99);
    }

    // Enforce floor if a high-precision signal hit
    if (highPrecision) {
      fused = math.max(fused, _cfg.minHighPrecisionConf);
    }

    // Gentle floor for having at least some signal
    if (fused < 0.55 && reasons.isNotEmpty) fused = 0.58;

    return CategoryGuess(category, fused, reasons);
  }

  // -----------------------
  // Merchant & rules
  // -----------------------

  // Canonical merchant dictionary (expand as you see data)
  static final Map<RegExp, String> _merchantCanonical = {
    RegExp(r'\b(BIGTREE|BOOK\s*MY\s*SHOW|BMS|BOOKMYSHOW)\b', caseSensitive: false): 'BOOKMYSHOW',
    RegExp(r'\b(SWIGGY)\b', caseSensitive: false): 'SWIGGY',
    RegExp(r'\b(ZOMATO)\b', caseSensitive: false): 'ZOMATO',
    RegExp(r'\b(OLA|UBER|RAPIDO)\b', caseSensitive: false): 'RIDEHAIL',
    RegExp(r'\b(AMAZON|AMZN)\b', caseSensitive: false): 'AMAZON',
    RegExp(r'\b(FLIPKART|FKART)\b', caseSensitive: false): 'FLIPKART',
    RegExp(r'\b(AJIO)\b', caseSensitive: false): 'AJIO',
    RegExp(r'\b(NYKAA)\b', caseSensitive: false): 'NYKAA',
    RegExp(r'\b(MYNTRA)\b', caseSensitive: false): 'MYNTRA',
    RegExp(r'\b(HPCL|BPCL|IOCL|BHARAT\s*PET|INDIAN\s*OIL)\b', caseSensitive: false): 'FUEL',
    RegExp(r'\b(VI|AIRTEL|JIO)\b', caseSensitive: false): 'TELCO',
    RegExp(r'\b(MEDPLUS|APOLLO\s*PHARM|NETMEDS|PHAR(E)?ASY)\b', caseSensitive: false): 'PHARMA',
    RegExp(r'\b(DMART|RELIANCE\s*SMART|BIG\s*BAZAR|MORE\s*SUPERMARKET)\b', caseSensitive: false): 'GROCERY',
  };

  // Merchant -> Category map
  static final Map<String, String> _merchantToCategory = {
    'BOOKMYSHOW': 'Entertainment/Movies',
    'SWIGGY': 'Food Delivery',
    'ZOMATO': 'Food Delivery',
    'RIDEHAIL': 'Transport/Cabs',
    'AMAZON': 'Shopping/Online',
    'FLIPKART': 'Shopping/Online',
    'AJIO': 'Shopping/Fashion',
    'NYKAA': 'Shopping/Beauty',
    'MYNTRA': 'Shopping/Fashion',
    'FUEL': 'Transport/Fuel',
    'TELCO': 'Utilities/Mobile',
    'PHARMA': 'Health/Pharmacy',
    'GROCERY': 'Groceries',
  };

  // Keywords -> Category (fallbacks)
  static final Map<RegExp, String> _keywordToCategory = {
    RegExp(r'\bMOVIE|CINEMA|TICKET|BMS\b', caseSensitive: false): 'Entertainment/Movies',
    RegExp(r'\bFOOD|MEAL|DINNER|LUNCH|RESTAURANT|ORDER\b', caseSensitive: false): 'Food & Dining',
    RegExp(r'\bFUEL|PETROL|DIESEL|GAS STATION\b', caseSensitive: false): 'Transport/Fuel',
    RegExp(r'\bRECHARGE|DATA|PREPAID|POSTPAID|BILL\b', caseSensitive: false): 'Utilities/Mobile',
    RegExp(r'\bMEDICINE|PHARMACY|CHEMIST\b', caseSensitive: false): 'Health/Pharmacy',
    RegExp(r'\bUBER|OLA|RAPIDO|CAB\b', caseSensitive: false): 'Transport/Cabs',
    RegExp(r'\bGROCERY|SUPERMARKET|DMART\b', caseSensitive: false): 'Groceries',
  };

  // Email domain -> Category
  static final Map<RegExp, String> _domainToCategory = {
    RegExp(r'BOOKMYSHOW', caseSensitive: false): 'Entertainment/Movies',
    RegExp(r'SWIGGY', caseSensitive: false): 'Food Delivery',
    RegExp(r'ZOMATO', caseSensitive: false): 'Food Delivery',
    RegExp(r'AMAZON', caseSensitive: false): 'Shopping/Online',
    RegExp(r'FLIPKART', caseSensitive: false): 'Shopping/Online',
    RegExp(r'NYKAA', caseSensitive: false): 'Shopping/Beauty',
    RegExp(r'AJIO', caseSensitive: false): 'Shopping/Fashion',
    RegExp(r'UBER|OLA|RAPIDO', caseSensitive: false): 'Transport/Cabs',
  };

  String? _merchantCategory(String? canonical, List<String> aliases) {
    if (canonical != null && _merchantToCategory.containsKey(canonical)) {
      return _merchantToCategory[canonical];
    }
    // Second chance: see if any alias regex directly maps to a merchant group
    for (final rx in _merchantCanonical.entries) {
      if (aliases.any((a) => rx.key.hasMatch(a))) {
        final can = rx.value;
        return _merchantToCategory[can];
      }
    }
    return null;
  }

  String? _emailDomainCategory(String domainUpper) {
    for (final e in _domainToCategory.entries) {
      if (e.key.hasMatch(domainUpper)) return e.value;
    }
    return null;
  }

  String? _keywordCategory(String textUpper) {
    for (final e in _keywordToCategory.entries) {
      if (e.key.hasMatch(textUpper)) return e.value;
    }
    return null;
  }

  // -----------------------
  // Helpers: merchant, regex, normalization
  // -----------------------

  String? _matchUserOverride(String? canonical, List<String> aliases) {
    if (_cfg.userOverrides.isEmpty) return null;

    // Direct canonical match
    if (canonical != null) {
      final key = canonical.toUpperCase();
      final hit = _cfg.userOverrides[key] ?? _cfg.userOverrides[canonical];
      if (hit != null) return hit;
    }
    // Alias match
    for (final a in aliases) {
      final k = a.toUpperCase();
      final hit = _cfg.userOverrides[k];
      if (hit != null) return hit;
    }
    return null;
  }

  String _norm(String s) => s
      .toUpperCase()
      .replaceAll(RegExp(r'[^A-Z0-9@/._\s-]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  // Find probable merchants in text
  List<String> _findMerchants(String text) {
    final outs = <String>{};

    // UPI/P2M/.../<MERCHANT>
    final upiP2M = RegExp(r'UPI\/P2M\/[A-Z0-9]+\/([A-Z0-9 &._-]{3,})');
    final m1 = upiP2M.firstMatch(text);
    if (m1 != null) outs.add((m1.group(1) ?? '').trim());

    // “AT <PLACE>” patterns
    final atRx = RegExp(r'\bAT\s+([A-Z0-9 &._-]{3,})\b');
    for (final m in atRx.allMatches(text)) {
      outs.add((m.group(1) ?? '').trim());
    }

    // Common known names
    for (final can in _merchantCanonical.entries) {
      if (can.key.hasMatch(text)) outs.add(can.value);
    }

    // Email-like hints embedded
    final domRx = RegExp(r'([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})');
    for (final m in domRx.allMatches(text)) {
      final domain = (m.group(2) ?? '').trim();
      if (domain.isNotEmpty) outs.add(domain);
    }

    return outs.toList();
  }

  String? _canonicalizeMerchant(List<String> aliases) {
    if (aliases.isEmpty) return null;

    // If any alias matches a canonical bucket regex, return that canonical key
    for (final rx in _merchantCanonical.entries) {
      if (aliases.any((a) => rx.key.hasMatch(a))) return rx.value;
    }

    // Fuzzy-lite: pick the "most alphanumeric" token as candidate
    aliases.sort((a, b) => _signalScore(a).compareTo(_signalScore(b)));
    final best = aliases.isNotEmpty ? aliases.last : null;
    return best;
  }

  int _signalScore(String s) {
    // Rough score: more letters/digits = better
    return RegExp(r'[A-Z0-9]').allMatches(s).length;
  }

  bool _looksLikeDebit(String text) {
    if (RegExp(r'\bDEBIT|DEBITED|DR\b').hasMatch(text)) return true;
    if (RegExp(r'\bCREDIT|CREDITED|CR\b').hasMatch(text)) return false;
    // Fallback heuristics: “paid/spent” => debit
    if (RegExp(r'\bPAID|SPENT|PURCHASE\b').hasMatch(text)) return true;
    return true; // default bias to debit in ambiguous SMS
  }

  String? _findUpiRef(String text) {
    final rx = RegExp(r'\bUPI\/[A-Z0-9]+\/([0-9]{9,})\b');
    final m = rx.firstMatch(text);
    return m?.group(1);
  }

  double? _findAmount(String text) {
    // Handles “INR 328.04”, “Rs. 1,234.56”, “₹500”, “INR328”
    final rx = RegExp(
      r'\b(?:INR|RS|₹)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b',
    );
    final m = rx.firstMatch(text);
    if (m == null) return null;
    final raw = (m.group(1) ?? '').replaceAll(',', '');
    return double.tryParse(raw);
  }

  DateTime? _findDate(String text) {
    // “13-09-25”, “13/09/2025”, “2025-09-13 15:09:41”
    final rxs = <RegExp>[
      RegExp(
          r'\b([0-3]?\d)[-/]([01]?\d)[-/]((?:20)?\d{2})(?:[, ]+([0-2]?\d:[0-5]\d(?::[0-5]\d)?))?'),
      RegExp(r'\b(20\d{2})-([01]\d)-([0-3]\d)(?:[ T]([0-2]?\d:[0-5]\d(?::[0-5]\d)?))?'),
    ];
    for (final rx in rxs) {
      final m = rx.firstMatch(text);
      if (m != null) {
        try {
          if (rx.pattern.startsWith(r'\b([0-3]?\d)')) {
            final d = int.parse(m.group(1)!);
            final mo = int.parse(m.group(2)!);
            var y = int.parse(m.group(3)!);
            if (y < 100) y += 2000;
            final t = m.group(4);
            if (t != null) {
              final parts = t.split(':').map(int.parse).toList();
              return DateTime(
                  y, mo, d, parts[0], parts[1], parts.length > 2 ? parts[2] : 0);
            }
            return DateTime(y, mo, d);
          } else {
            final y = int.parse(m.group(1)!);
            final mo = int.parse(m.group(2)!);
            final d = int.parse(m.group(3)!);
            final t = m.group(4);
            if (t != null) {
              final parts = t.split(':').map(int.parse).toList();
              return DateTime(
                  y, mo, d, parts[0], parts[1], parts.length > 2 ? parts[2] : 0);
            }
            return DateTime(y, mo, d);
          }
        } catch (_) {/* ignore */}
      }
    }
    return null;
  }

  DateTime? _parseDateLoose(String snippet) {
    // Last-chance parse on MLKit’s date text, using the same regexes
    return _findDate(_norm(snippet));
  }

  double? _pickBestAmount(String snippet) {
    return _findAmount(_norm(snippet));
  }

  String fallbackCategory(bool isDebit) =>
      isDebit ? 'Uncategorized/Debit' : 'Uncategorized/Credit';
}
