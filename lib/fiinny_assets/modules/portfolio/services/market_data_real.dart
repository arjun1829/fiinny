import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:lifemap/config/app_config.dart';
import '../models/price_quote.dart';
import 'market_data_service.dart';

class MarketDataReal extends MarketDataService {
  final http.Client _client = http.Client();

  Uri _buildUri(List<String> syms) {
    final base = AppConfig.quotesBaseUrl; // e.g. https://fiinny-proxy.fiinny-tools.workers.dev/quotes
    return Uri.parse(base).replace(queryParameters: {
      'symbols': syms.map((e) => e.toUpperCase()).join(','),
    });
  }

  Map<String, dynamic> _parseBody(http.Response r) {
    if (r.statusCode != 200) {
      throw Exception('Quotes HTTP ${r.statusCode}');
    }
    final body = json.decode(r.body) as Map<String, dynamic>;
    if (!body.containsKey('quotes')) {
      throw Exception('Malformed response: missing "quotes"');
    }
    return body['quotes'] as Map<String, dynamic>;
  }

  PriceQuote _fromJson(String k, Map<String, dynamic> j) => PriceQuote(
    symbol: (j['symbol'] ?? k).toString().toUpperCase(),
    ltp: (j['ltp'] as num).toDouble(),
    change: (j['change'] as num).toDouble(),
    changePct: (j['changePct'] as num).toDouble(),
    asOf: j['asOf'] != null ? DateTime.tryParse(j['asOf']) : null,
  );

  @override
  Future<PriceQuote> fetchQuote(String symbol) async {
    final uri = _buildUri([symbol]);
    final resp = await _client
        .get(uri)
        .timeout(const Duration(milliseconds: AppConfig.receiveTimeoutMs));
    final quotes = _parseBody(resp);
    final item = quotes[symbol.toUpperCase()] as Map<String, dynamic>?;
    if (item == null) throw Exception('No quote for $symbol');
    return _fromJson(symbol, item);
  }

  @override
  Future<Map<String, PriceQuote>> fetchQuotes(List<String> symbols) async {
    if (symbols.isEmpty) return {};
    final uri = _buildUri(symbols);
    final resp = await _client
        .get(uri)
        .timeout(const Duration(milliseconds: AppConfig.receiveTimeoutMs));
    final map = _parseBody(resp);
    return map.map((k, v) => MapEntry(k.toUpperCase(), _fromJson(k, v)));
  }
}
