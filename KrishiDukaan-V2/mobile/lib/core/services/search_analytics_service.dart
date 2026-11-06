import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/app_config.dart';
import '../providers/location_provider.dart' show LatLng;

/// App side of Admin > Search insights — posts to the same
/// /api/analytics/search endpoint web's app/lib/search-analytics.ts uses,
/// which folds each call into one daily aggregate doc (searchStats/{day}).
///
/// A search is sent only after it SETTLES (no newer term for [_settle]), so
/// typing "u", "ur", "urea" records just "urea"; each term and category is
/// sent at most once per app session. Fire-and-forget: never awaited by UI
/// and failures are ignored.
///
/// Each event also carries the shopper's real location when known, rounded
/// to ~1 km (the server turns it into a state + district and keeps only
/// counts), and a search carries the main category of its results.
class SearchAnalyticsService {
  SearchAnalyticsService._();
  static final instance = SearchAnalyticsService._();

  static const _settle = Duration(milliseconds: 1500);

  final _logged = <String>{};
  Timer? _pending;

  /// Call when results for [query] are ready; [results] is how many matched,
  /// [category] their main category, [at] the shopper's real location.
  void scheduleSearch(String query, int results, {String category = '', LatLng? at}) {
    _pending?.cancel();
    final q = query.trim().toLowerCase();
    if (q.length < 2) return;
    _pending = Timer(_settle, () {
      if (_logged.add('q:$q')) {
        _send({
          'kind': 'search',
          'q': q,
          'results': results,
          if (category.isNotEmpty) 'category': category,
        }, at);
      }
    });
  }

  /// Call when the shopper picks a category chip.
  void logCategory(String? category, {LatLng? at}) {
    final c = category?.trim() ?? '';
    if (c.isEmpty || c.toLowerCase() == 'all') return;
    if (_logged.add('c:${c.toLowerCase()}')) {
      _send({'kind': 'category', 'category': c}, at);
    }
  }

  static const _genericCategories = {'', 'all', 'general', 'other', 'others'};

  /// The category most of [categories] (in result order) belong to, or ''.
  static String mainCategory(Iterable<String> categories) {
    final counts = <String, int>{};
    final labels = <String, String>{};
    for (final raw in categories.take(30)) {
      final label = raw.trim();
      final key = label.toLowerCase();
      if (_genericCategories.contains(key)) continue;
      counts[key] = (counts[key] ?? 0) + 1;
      labels.putIfAbsent(key, () => label);
    }
    var best = '';
    var bestN = 0;
    counts.forEach((key, n) {
      if (n > bestN) {
        best = labels[key]!;
        bestN = n;
      }
    });
    return best;
  }

  static double _round2(double v) => (v * 100).roundToDouble() / 100;

  void _send(Map<String, Object?> body, LatLng? at) {
    http
        .post(
          Uri.parse('${AppConfig.apiBaseUrl}/api/analytics/search'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({
            ...body,
            'source': 'app',
            if (at != null) 'lat': _round2(at.lat),
            if (at != null) 'lng': _round2(at.lng),
          }),
        )
        .timeout(const Duration(seconds: 10))
        .then((_) {}, onError: (_) {});
  }
}
