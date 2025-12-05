import '../config/region_profile.dart';

class MerchantInfo {
  final String id;
  final String name;
  final String defaultCategory;
  final String? logoUrl;

  const MerchantInfo({
    required this.id,
    required this.name,
    required this.defaultCategory,
    this.logoUrl,
  });
}

class GlobalMerchantRegistry {
  // Region -> RawString -> MerchantInfo
  static final Map<String, Map<String, MerchantInfo>> _registry = {
    'IN': {
      'swiggy': const MerchantInfo(id: 'swiggy_in', name: 'Swiggy', defaultCategory: 'Food'),
      'zomato': const MerchantInfo(id: 'zomato_in', name: 'Zomato', defaultCategory: 'Food'),
      'uber': const MerchantInfo(id: 'uber_in', name: 'Uber', defaultCategory: 'Transport'),
      'ola': const MerchantInfo(id: 'ola_in', name: 'Ola', defaultCategory: 'Transport'),
      'amazon': const MerchantInfo(id: 'amazon_in', name: 'Amazon', defaultCategory: 'Shopping'),
      'flipkart': const MerchantInfo(id: 'flipkart_in', name: 'Flipkart', defaultCategory: 'Shopping'),
      'jio': const MerchantInfo(id: 'jio_in', name: 'Jio', defaultCategory: 'Utilities'),
      'airtel': const MerchantInfo(id: 'airtel_in', name: 'Airtel', defaultCategory: 'Utilities'),
    },
    'US': {
      'uber': const MerchantInfo(id: 'uber_us', name: 'Uber', defaultCategory: 'Transport'),
      'lyft': const MerchantInfo(id: 'lyft_us', name: 'Lyft', defaultCategory: 'Transport'),
      'amazon': const MerchantInfo(id: 'amazon_us', name: 'Amazon', defaultCategory: 'Shopping'),
      'walmart': const MerchantInfo(id: 'walmart_us', name: 'Walmart', defaultCategory: 'Groceries'),
      'target': const MerchantInfo(id: 'target_us', name: 'Target', defaultCategory: 'Shopping'),
      'starbucks': const MerchantInfo(id: 'starbucks_us', name: 'Starbucks', defaultCategory: 'Food'),
      'netflix': const MerchantInfo(id: 'netflix_us', name: 'Netflix', defaultCategory: 'Entertainment'),
    },
    'GLOBAL': {
      'netflix': const MerchantInfo(id: 'netflix_gl', name: 'Netflix', defaultCategory: 'Entertainment'),
      'spotify': const MerchantInfo(id: 'spotify_gl', name: 'Spotify', defaultCategory: 'Entertainment'),
      'apple': const MerchantInfo(id: 'apple_gl', name: 'Apple', defaultCategory: 'Electronics'),
      'google': const MerchantInfo(id: 'google_gl', name: 'Google', defaultCategory: 'Services'),
    }
  };

  static MerchantInfo? normalize(String rawMerchant, {required String regionCode}) {
    final lower = rawMerchant.toLowerCase();
    
    // 1. Check Region Specific Registry
    final regionMap = _registry[regionCode];
    if (regionMap != null) {
      for (final key in regionMap.keys) {
        if (lower.contains(key)) {
          return regionMap[key];
        }
      }
    }

    // 2. Check Global Registry
    final globalMap = _registry['GLOBAL'];
    if (globalMap != null) {
      for (final key in globalMap.keys) {
        if (lower.contains(key)) {
          return globalMap[key];
        }
      }
    }

    return null;
  }
}
