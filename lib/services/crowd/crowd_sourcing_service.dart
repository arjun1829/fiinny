import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';

class CrowdSourcingService {
  CrowdSourcingService._();
  static final CrowdSourcingService instance = CrowdSourcingService._();

  Map<String, dynamic> _dictionary = {};
  bool _isLoaded = false;

  /// Load the dictionary into memory
  Future<void> init() async {
    if (_isLoaded) return;
    try {
      // 1. Try to load from "cache" (Application Documents)
      final cacheFile = await _getCacheFile();
      if (await cacheFile.exists()) {
        final content = await cacheFile.readAsString();
        final json = jsonDecode(content);
        if (json is Map && json.containsKey('mappings')) {
          _dictionary = Map<String, dynamic>.from(json['mappings']);
          _isLoaded = true;
          debugPrint('[Crowd] Loaded from local cache (${_dictionary.length} entries)');
          return;
        }
      }

      // 2. Fallback to bundled asset
      final assetContent = await rootBundle.loadString('assets/enrich/merchants_crowd_v1.json');
      final json = jsonDecode(assetContent);
      if (json is Map && json.containsKey('mappings')) {
        _dictionary = Map<String, dynamic>.from(json['mappings']);
        _isLoaded = true;
        debugPrint('[Crowd] Loaded from bundled asset (${_dictionary.length} entries)');
        
        // Save to cache for next time (simulate "first download" behavior)
        await cacheFile.writeAsString(assetContent);
      }
    } catch (e) {
      debugPrint('[Crowd] Failed to init: $e');
    }
  }

  /// Lookup a normalized merchant string (e.g. "UBER TRIP")
  /// Returns {nav: "Travel", sub: "Taxi", c: 0.9} or null
  Map<String, dynamic>? lookup(String merchant) {
    if (!_isLoaded) return null;
    final key = merchant.toUpperCase().trim();
    if (_dictionary.containsKey(key)) {
      return Map<String, dynamic>.from(_dictionary[key]);
    }
    return null;
  }

  /// (Stub) future method to report a new mapping
  Future<void> contribute(String merchant, String category) async {
    // In future: Push to Firestore "unverified_mappings" collection
    debugPrint('[Crowd] Vote recorded: $merchant -> $category');
  }
  
  Future<File> _getCacheFile() async {
    final directory = await getApplicationDocumentsDirectory();
    return File('${directory.path}/merchants_crowd_local.json');
  }
}
