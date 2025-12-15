import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/services/categorization/category_rules.dart';
import 'package:lifemap/services/parse_engine/common_regex.dart';

void main() {
  group('Category Fixes Repro', () {
    test('Ratnadeep should be Groceries', () {
      final merchant = 'Ratnadeep Super Market';
      // Test CommonRegex (Alerts)
      final alertCat = CommonRegex.categoryHint('spent at $merchant', merchantName: merchant);
      expect(alertCat, 'Groceries', reason: 'CommonRegex should map Ratnadeep to Groceries');
      
      // Test CategoryRules (Ingest fallback)
      final rule = CategoryRules.categorizeMerchant('spent at $merchant', merchant);
      expect(rule.category, 'Shopping');
      expect(rule.subcategory, 'groceries and consumables');
    });

    test('Karachi Bakery should be Food', () {
      final merchant = 'Karachi Bakery';
      final alertCat = CommonRegex.categoryHint('paid to $merchant', merchantName: merchant);
      expect(alertCat, 'Food', reason: 'CommonRegex should map Karachi Bakery to Food');

      final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
      expect(rule.category, 'Food');
    });
    
    test('Ashok Chava should be Food', () {
       final merchant = 'Ashok Chava';
       final alertCat = CommonRegex.categoryHint('paid to $merchant', merchantName: merchant);
       expect(alertCat, 'Food');
       
       final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
       expect(rule.category, 'Food');
    });

    test('Starbucks should be Food', () {
       final merchant = 'Starbucks';
       expect(CommonRegex.categoryHint('paid to $merchant', merchantName: merchant), 'Food');
       
       final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
       expect(rule.category, 'Food'); 
    });
    test('Newsletter false positives should be ignored', () {
      // "except for the media stocks" -> "for the media stocks" -> "media stocks"
      final text = 'All sectors’ stocks rose today except for the media stocks and oil and gas stocks.';
      final merchant = CommonRegex.extractMerchant(text);
      expect(merchant, isNull, reason: '"except for" pattern should not trigger merchant extraction');
    });
  });
}
