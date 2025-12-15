import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/services/categorization/category_rules.dart';
import 'package:lifemap/services/parse_engine/common_regex.dart';

void main() {
  group('Category Fixes Repro', () {
    test('Ratnadeep should be Groceries', () {
      final merchant = 'Ratnadeep Super Market';
      // Test CommonRegex (Alerts)
      final alertRes = CommonRegex.categoryHint('spent at $merchant', merchantName: merchant);
      expect(alertRes.category, 'Groceries', reason: 'CommonRegex should map Ratnadeep to Groceries');
      expect(alertRes.subcategory, 'groceries and consumables');
      
      // Test CategoryRules (Ingest fallback)
      final rule = CategoryRules.categorizeMerchant('spent at $merchant', merchant);
      expect(rule.category, 'Shopping');
      expect(rule.subcategory, 'groceries and consumables');
    });

    test('Karachi Bakery should be Food', () {
      final merchant = 'Karachi Bakery';
      final res = CommonRegex.categoryHint('paid to $merchant', merchantName: merchant);
      expect(res.category, 'Food', reason: 'CommonRegex should map Karachi Bakery to Food');
      expect(res.subcategory, 'dining');

      final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
      expect(rule.category, 'Food');
    });
    
    test('Ashok Chava should be Food', () {
       final merchant = 'Ashok Chava';
       final res = CommonRegex.categoryHint('paid to $merchant', merchantName: merchant);
       expect(res.category, 'Food');
       
       final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
       expect(rule.category, 'Food');
    });

    test('Starbucks should be Food', () {
       final merchant = 'Starbucks';
       final res = CommonRegex.categoryHint('paid to $merchant', merchantName: merchant);
       expect(res.category, 'Food');
       
       final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
       expect(rule.category, 'Food'); 
    });
    
    test('Newsletter false positives should be ignored', () {
      // "except for the media stocks" -> "for the media stocks" -> "media stocks"
      final text = 'All sectors’ stocks rose today except for the media stocks and oil and gas stocks.';
      final merchant = CommonRegex.extractMerchant(text);
      expect(merchant, isNull, reason: '"except for" pattern should not trigger merchant extraction');
    });

    test('P2P Transfer should be Transfer', () {
      final text = 'UPI/P2A/534935913468/SHREYA AGNIHOTRI';
      final isP2P = text.contains('UPI/P2A');
      final res = CommonRegex.categoryHint(text, merchantName: 'SHREYA AGNIHOTRI', isP2P: isP2P);
      expect(res.category, 'Transfer');
      expect(res.subcategory, 'p2p');
    });

    test('Blinkit should be Groceries', () {
      final merchant = 'Blinkit';
      final res = CommonRegex.categoryHint('paid to $merchant', merchantName: merchant);
      expect(res.category, 'Groceries');
      
      // Also verify rule fallback
      final rule = CategoryRules.categorizeMerchant('paid to $merchant', merchant);
      expect(rule.category, 'Shopping');
      expect(rule.subcategory, 'groceries and consumables');
    });

    test('Unknown merchant on Credit Card should default to Shopping', () {
      final text = '''
      Merchant Name:
      MUKADDARKA
      Axis Bank Credit Card No.
      XX4777
      ''';
      final merchant = CommonRegex.extractMerchant(text);
      expect(merchant, 'MUKADDARKA');
      
      // Without isCard -> Other
      var res = CommonRegex.categoryHint(text, merchantName: merchant, isCard: false);
      expect(res.category, 'Other');

      // With isCard -> Shopping
      res = CommonRegex.categoryHint(text, merchantName: merchant, isCard: true);
      expect(res.category, 'Shopping', reason: 'Unknown merchant on Card should default to Shopping');
      expect(res.subcategory, 'general');
    });
  });
}
