// lib/services/parsing_enrichment.dart
//
// Lightweight, rules-only enrichment on top of the parsed transaction:
//  - Canonicalizes merchant names using a registry (aliases -> nice display name)
//  - Maps merchants to categories using a keyword dictionary
//
// Depends on these assets/files (already provided earlier):
//   assets/enrich/merchants.json
//   assets/enrich/categories.json
//   lib/parsing_core/enrich/merchant_registry.dart
//   lib/parsing_core/enrich/category_mapper.dart
//
// Typical usage (before you upsert a ParsedTxn or right after parsing):
//   final enricher = ParsingEnrichment();
//   await enricher.ensureLoaded();
//   final refined = enricher.enrich(txn);
//
// Or if you only have raw merchant string:
//   final refinedFields = await enricher.refineFields(
//     merchantRaw: "swiggyblr-123",
//     fallbackCategory: "Uncategorized",
//   );
//   // refinedFields['merchant'] -> "Swiggy"
//   // refinedFields['category'] -> "Dining"

import '../parsing_core/enrich/merchant_registry.dart';
import '../parsing_core/enrich/category_mapper.dart';
import '../parsing_core/models/parsed_txn.dart';

class ParsingEnrichment {
  ParsingEnrichment({MerchantRegistry? merchantRegistry, CategoryMapper? categoryMapper})
      : _mer = merchantRegistry ?? MerchantRegistry(),
        _cat = categoryMapper ?? CategoryMapper();

  final MerchantRegistry _mer;
  final CategoryMapper _cat;

  bool _loaded = false;

  /// Load dictionaries once (idempotent).
  Future<void> ensureLoaded() async {
    if (_loaded) return;
    await _mer.load();
    await _cat.load();
    _loaded = true;
  }

  /// Return a *new* ParsedTxn with improved merchantName + category.
  /// - If merchantName is null, category remains unchanged.
  /// - If merchantName exists, it is canonicalized and category mapped via dictionary.
  ParsedTxn enrich(ParsedTxn txn) {
    if (!_loaded) {
      // Not throwing: allow silent no-op if ensureLoaded wasn't awaited.
      // You can also make this method async if you prefer auto-loading.
    }

    String? niceMerchant = txn.merchantName;
    String category = txn.category;

    if (txn.merchantName != null && txn.merchantName!.trim().isNotEmpty) {
      // Canonicalize merchant alias → display name
      niceMerchant = _mer.canonical(txn.merchantName!);

      // Map to a rule-based category using keywords
      category = _cat.mapCategory(
        merchant: niceMerchant,
        fallback: txn.category,
      );
    }

    // Return a shallow copy with refined fields
    return ParsedTxn(
      txKey: txn.txKey,
      direction: txn.direction,
      amount: txn.amount,
      currency: txn.currency,
      when: txn.when,
      instrument: txn.instrument,
      instrumentTail: txn.instrumentTail,
      merchantName: niceMerchant,
      upiHandle: txn.upiHandle,
      txnId: txn.txnId,
      category: category,
      confidence: txn.confidence,
      sources: txn.sources,
      debug: txn.debug,
    );
  }

  /// Convenience helper if you *only* need merchant & category fields.
  Future<Map<String, String?>> refineFields({
    required String? merchantRaw,
    required String fallbackCategory,
  }) async {
    await ensureLoaded();
    if (merchantRaw == null || merchantRaw.trim().isEmpty) {
      return {'merchant': null, 'category': fallbackCategory};
    }
    final nice = _mer.canonical(merchantRaw);
    final cat = _cat.mapCategory(merchant: nice, fallback: fallbackCategory);
    return {'merchant': nice, 'category': cat};
  }
}
