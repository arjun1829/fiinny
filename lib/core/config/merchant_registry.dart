
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

class MerchantRegistry {
  // Region -> RawString -> MerchantInfo
  static final Map<String, Map<String, MerchantInfo>> _registry = {
    'IN': {
      'swiggy': const MerchantInfo(
          id: 'swiggy_in', name: 'Swiggy', defaultCategory: 'Food'),
      // ... (rest of map) ...
    }
  };

  // Instance wrapper for DI
  Future<void> load() async {
    // No-op for static registry
  }

  String canonical(String raw, {String region = 'IN'}) {
    final info = normalize(raw, regionCode: region);
    return info?.name ?? raw;
  }

  MerchantInfo? resolve(String raw, String region) =>
      normalize(raw, regionCode: region);

  static MerchantInfo? normalize(String rawMerchant,
      {required String regionCode}) {
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
