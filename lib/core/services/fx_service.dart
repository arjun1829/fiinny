import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

class FxService {
  // Singleton
  static final FxService _instance = FxService._internal();
  factory FxService() => _instance;
  FxService._internal();

  static const String _baseUrl = 'https://api.frankfurter.app';
  static const String _prefsKeyRates = 'fiinny_fx_rates';
  static const String _prefsKeyDate = 'fiinny_fx_date';

  // In-memory cache
  Map<String, double> _rates = {
    'USD': 1.0,
    'EUR': 0.92,
    'GBP': 0.79,
    'INR': 84.0,
    'SGD': 1.35,
    'CAD': 1.36,
    'AUD': 1.52,
    'JPY': 150.0,
  };
  DateTime? _lastFetch;

  Future<void> init() async {
    await _loadFromCache();
    // Fetch if cache is older than 24 hours or empty
    if (_shouldFetch()) {
      await fetchRates();
    }
  }

  bool _shouldFetch() {
    if (_lastFetch == null) {
      return true;
    }
    final difference = DateTime.now().difference(_lastFetch!);
    return difference.inHours > 24;
  }

  Future<void> _loadFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final ratesJson = prefs.getString(_prefsKeyRates);
      final dateStr = prefs.getString(_prefsKeyDate);

      if (ratesJson != null && dateStr != null) {
        final decoded = jsonDecode(ratesJson) as Map<String, dynamic>;
        _rates = decoded.map((k, v) => MapEntry(k, (v as num).toDouble()));
        // Ensure Base USD is present
        _rates['USD'] = 1.0;
        _lastFetch = DateTime.parse(dateStr);
        debugPrint('FxService: Loaded cached rates from $_lastFetch');
      }
    } catch (e) {
      debugPrint('FxService: Error loading cache: $e');
    }
  }

  Future<void> fetchRates() async {
    try {
      // Frankfurter uses EUR as base by default. We'll fetch relative to USD for consistency if preferred,
      // but let's fetch based on USD to make our map easiest.
      final response = await http.get(Uri.parse('$_baseUrl/latest?from=USD'));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final fetchedRates = data['rates'] as Map<String, dynamic>;

        // Update memory
        _rates = fetchedRates.map((k, v) => MapEntry(k, (v as num).toDouble()));
        _rates['USD'] = 1.0; // Base
        _lastFetch = DateTime.now();

        // Save to cache
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefsKeyRates, jsonEncode(_rates));
        await prefs.setString(_prefsKeyDate, _lastFetch!.toIso8601String());

        debugPrint(
            'FxService: Updated rates successfully. USD/INR: ${_rates['INR']}');
      } else {
        debugPrint('FxService: API Error ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('FxService: Fetch Error: $e');
      // Keep using cache or hardcoded
    }
  }

  /// Returns rate to convert 1 Unit of [from] -> [to]
  double getRate(String from, String to) {
    if (from == to) {
      return 1.0;
    }

    // Everything is stored relative to USD (Base 1.0)
    // if from=EUR, rate is ~0.92 (meaning 1 USD = 0.92 EUR) => NO, wait.
    // Frankfurter 'latest?from=USD' returns: 'rates': {'EUR': 0.92, ...}
    // This means 1 USD = 0.92 EUR.
    // So Value(USD) * Rate = Value(EUR).

    // To convert FROM -> TO:
    // 1. Convert FROM users amount to USD. (Amount / RateFrom)
    //    e.g. 10 EUR. Rate is 0.92. USD Amount = 10 / 0.92 = 10.86 USD.
    // 2. Convert USD to TO. (USD Amount * RateTo)
    //    e.g. to INR (rate 84). 10.86 * 84 = 912 INR.

    final fromRate = _rates[from.toUpperCase()] ?? 0.0;
    final toRate = _rates[to.toUpperCase()] ?? 0.0;

    if (fromRate == 0 || toRate == 0) {
      // Fallback
      debugPrint('FxService Warning: Missing rate for $from or $to');
      if (from == 'USD') {
        return 1.0;
      }
      return 1.0;
    }

    return (1.0 / fromRate) * toRate;
  }

  double convert(double amount, String from, String to) {
    if (from == to) {
      return amount;
    }
    return amount * getRate(from, to);
  }
}
