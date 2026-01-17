import 'dart:convert';
import 'package:flutter/services.dart';

class CategoryMapper {
  Map<String, String> _rules = {};
  bool _loaded = false;

  /// Load rules from assets/enrich/categories.json
  /// file format expected: { "keyword": "Category", "swiggy": "Dining" }
  Future<void> load() async {
    if (_loaded) return;
    try {
      final jsonString =
          await rootBundle.loadString('assets/enrich/categories.json');
      final Map<String, dynamic> decoded = json.decode(jsonString);
      _rules = decoded.map((k, v) => MapEntry(k.toLowerCase(), v.toString()));
      _loaded = true;
    } catch (e) {
      // Fallback or log if asset missing
      // debugPrint('CategoryMapper load failed: $e');
    }
  }

  String mapCategory({String? merchant, required String fallback}) {
    if (merchant == null || merchant.isEmpty) return fallback;
    if (!_loaded) return fallback;

    final lower = merchant.toLowerCase();

    // 1. Exact match
    if (_rules.containsKey(lower)) {
      return _rules[lower]!;
    }

    // 2. Partial match (keyword search)
    // This is simple O(N) but map is likely small (< 500 rules).
    for (final entry in _rules.entries) {
      if (lower.contains(entry.key)) {
        return entry.value;
      }
    }

    return fallback;
  }
}
