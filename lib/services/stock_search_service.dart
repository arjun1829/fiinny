import 'dart:async';

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/stock_ticker_model.dart';

class StockSearchService {
  // Singleton
  static final StockSearchService _instance = StockSearchService._internal();
  factory StockSearchService() => _instance;
  StockSearchService._internal();

  // Yahoo Finance APIs (unofficial free endpoints)
  static const _searchBase =
      "https://query1.finance.yahoo.com/v1/finance/search";
  static const _chartBase = "https://query1.finance.yahoo.com/v8/finance/chart";

  Future<List<StockTickerModel>> search(String query) async {
    if (query.trim().isEmpty) return [];

    // 1. Special case for "Gold" to suggest GoldBees (ETF) which is a common proxy
    if (query.toLowerCase().trim() == 'gold') {
      return [
        const StockTickerModel(
            symbol: "GOLDBEES.NS",
            name: "Nippon India ETF Gold BeES",
            exchange: "NSE",
            price: 0, // Will fetch
            sector: "Gold"),
        const StockTickerModel(
            symbol: "GC=F",
            name: "Gold Futures",
            exchange: "COMEX",
            price: 0,
            sector: "Commodity")
      ];
    }

    try {
      final url = Uri.parse("$_searchBase?q=$query&quotesCount=15&newsCount=0");
      final response = await http.get(url);

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final quotes = data['quotes'] as List;

        // Filter for NSE/BSE or useful entities only?
        // Yahoo returns generic stuff too. Let's prefer 'EQUITY', 'ETF', 'MUTUALFUND'
        // And Exchange == 'NSI' (NSE) or 'BSE' roughly.
        // NSI in Yahoo is usually '.NS', BSE is '.BO'

        final List<StockTickerModel> results = [];

        for (final q in quotes) {
          final symbol = q['symbol'] as String;
          final name = q['shortname'] ?? q['longname'] ?? symbol;
          final type = q['quoteType'] as String?;
          final exch = q['exchange'] as String?;

          // Simple sector mapping
          String sector = "Equity";
          if (type == 'ETF' || type == 'MUTUALFUND') sector = "Mutual Fund/ETF";
          if (type == 'CRYPTOCURRENCY') sector = "Crypto";
          if (type == 'CURRENCY') sector = "Currency";

          // Prefer Indian stocks for now if exchange matches, but allow others
          // Yahoo uses 'NSI' for NSE, 'BSE' for Bombay.
          // Yahoo uses 'NSI' for NSE, 'BSE' for Bombay.

          // Skip obscure stuff if we want to be strict, but for now allow generic
          results.add(StockTickerModel(
            symbol: symbol,
            name: name,
            exchange: exch ?? 'Unknown',
            price:
                0.0, // Search API often doesn't give RT price. We fetch later or UI shows "..."
            sector: sector,
          ));
        }
        return results;
      }
    } catch (e) {
      // debugPrint("Yahoo Search Error: $e");
    }
    return [];
  }

  /// Fetches the latest price for a symbol
  Future<double?> fetchPrice(String symbol) async {
    try {
      final url = Uri.parse("$_chartBase/$symbol?interval=1d&range=1d");
      final response = await http.get(url);

      if (response.statusCode == 200) {
        final jsonBody = json.decode(response.body);
        final result = jsonBody['chart']['result']?[0];
        if (result != null) {
          final meta = result['meta'];
          final price = meta['regularMarketPrice'] as num?;
          return price?.toDouble();
        }
      }
    } catch (e) {
      // debugPrint("Yahoo Price Error for $symbol: $e");
    }
    return null;
  }

  /// Helper to get full object with price
  Future<StockTickerModel> enrich(StockTickerModel partial) async {
    final p = await fetchPrice(partial.symbol);
    if (p != null) {
      // Return new instance with price
      return StockTickerModel(
          symbol: partial.symbol,
          name: partial.name,
          exchange: partial.exchange,
          sector: partial.sector,
          price: p,
          logoUrl: partial.logoUrl);
    }
    return partial;
  }
}
