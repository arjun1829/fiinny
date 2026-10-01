import 'package:cloud_firestore/cloud_firestore.dart';

/// The window an analytics view covers. Matches the `period` value carried by
/// an `analytics_digest` notification, so tapping a weekly report opens the
/// screen already scoped to the same week the report was about.
enum AnalyticsPeriod {
  week('week', 'Week', 7),
  month('month', 'Month', 30),
  year('year', 'Year', 365);

  final String key;
  final String label;
  final int days;
  const AnalyticsPeriod(this.key, this.label, this.days);

  static AnalyticsPeriod fromKey(String? key) => AnalyticsPeriod.values
      .firstWhere((p) => p.key == key, orElse: () => AnalyticsPeriod.week);
}

/// An explicit start/end window for the Custom Date Range filter, alongside
/// the preset Week/Month/Year periods above. Both bounds are inclusive
/// calendar days (local midnight) — mirrors web's analytics-firestore.ts
/// getDaySeries, just built from a picked range instead of a fixed day count.
class AnalyticsRange {
  final DateTime start;
  final DateTime end;

  AnalyticsRange({required DateTime start, required DateTime end})
      : start = DateTime(start.year, start.month, start.day),
        end = DateTime(end.year, end.month, end.day);

  int get dayCount => end.difference(start).inDays + 1;

  List<DateTime> get days =>
      List.generate(dayCount, (i) => start.add(Duration(days: i)));

  List<String> dayKeys() => days.map(StoreAnalyticsRepository.dayKey).toList();
}

/// Reach and engagement numbers for one seller over one period — the figures
/// the weekly/monthly/yearly digest notification quotes.
class StoreAnalytics {
  final int storeViews;
  final int productViews;
  final int productClicks;
  final int calls;
  final int directionRequests;
  final int followers;
  final int reelViews;
  final int reelLikes;
  final int reelComments;

  const StoreAnalytics({
    this.storeViews = 0,
    this.productViews = 0,
    this.productClicks = 0,
    this.calls = 0,
    this.directionRequests = 0,
    this.followers = 0,
    this.reelViews = 0,
    this.reelLikes = 0,
    this.reelComments = 0,
  });

  int get interactions => reelLikes + reelComments;
}

/// Reads the same per-day counter maps the digest Cloud Function sums
/// server-side (`impressionsByDay`, `clicksByDay`, `callsByDay`,
/// `directionRequestsByDay` on products; `storeViewsByDay` on the retailer
/// doc), so the screen and the notification never disagree.
class StoreAnalyticsRepository {
  final FirebaseFirestore _db;
  StoreAnalyticsRepository({FirebaseFirestore? db})
      : _db = db ?? FirebaseFirestore.instance;

  static String dayKey(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  /// Day keys covering the last [days] days, today included.
  static List<String> _dayKeysFor(int days) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return List.generate(
        days, (i) => dayKey(today.subtract(Duration(days: days - 1 - i))));
  }

  static int _sumByDay(dynamic map, List<String> keys) {
    if (map is! Map) return 0;
    var total = 0;
    for (final k in keys) {
      final v = map[k];
      if (v is num) total += v.toInt();
    }
    return total;
  }

  /// [customRange] overrides [period] when set — the Custom Date Range
  /// filter picks an explicit start/end instead of one of the presets.
  Future<StoreAnalytics> fetch(
    String sellerPhone,
    AnalyticsPeriod period, {
    AnalyticsRange? customRange,
  }) async {
    if (sellerPhone.isEmpty) return const StoreAnalytics();
    final keys = customRange?.dayKeys() ?? _dayKeysFor(period.days);

    var productViews = 0, clicks = 0, calls = 0, directions = 0;

    // Dual-field owner query — products are keyed by retailerPhone on some
    // docs and ownerPhone on others (see CLAUDE.md). Deduplicated by doc id.
    final seen = <String>{};
    final productSnaps = await Future.wait([
      _db.collection('products').where('retailerPhone', isEqualTo: sellerPhone).get(),
      _db.collection('products').where('ownerPhone', isEqualTo: sellerPhone).get(),
    ]);
    for (final snap in productSnaps) {
      for (final doc in snap.docs) {
        if (!seen.add(doc.id)) continue;
        final d = doc.data();
        productViews += _sumByDay(d['impressionsByDay'], keys);
        clicks += _sumByDay(d['clicksByDay'], keys);
        calls += _sumByDay(d['callsByDay'], keys);
        directions += _sumByDay(d['directionRequestsByDay'], keys);
      }
    }

    // Store profile views, bumped when a shopper opens the shop profile.
    var storeViews = 0;
    try {
      final retailer = await _db.collection('retailers').doc(sellerPhone).get();
      if (retailer.exists) {
        storeViews = _sumByDay(retailer.data()?['storeViewsByDay'], keys);
      }
    } catch (_) {
      // Unreadable retailer doc — leave store views at zero rather than fail.
    }

    // Followers is a running total, not a per-period count: `follows` docs
    // carry a createdAt but counting them by range needs an index the app
    // doesn't ship, and the lifetime number is the more useful one on screen.
    var followers = 0;
    try {
      final agg = await _db
          .collection('follows')
          .where('followedShopId', isEqualTo: sellerPhone)
          .count()
          .get();
      followers = agg.count ?? 0;
    } catch (_) {
      // Ignore.
    }

    // Reel engagement comes off the seller's own reels. The server-side
    // `engagement_buffer` is a better per-period source but is deliberately
    // unreadable by clients (see firestore.rules).
    var reelViews = 0, reelLikes = 0, reelComments = 0;
    try {
      final reels = await _db
          .collection('reels')
          .where('shopOwnerId', isEqualTo: sellerPhone)
          .get();
      for (final doc in reels.docs) {
        final d = doc.data();
        reelViews += (d['viewsCount'] as num?)?.toInt() ?? 0;
        reelLikes += (d['likesCount'] as num?)?.toInt() ?? 0;
        reelComments += (d['commentsCount'] as num?)?.toInt() ?? 0;
      }
    } catch (_) {
      // Ignore.
    }

    return StoreAnalytics(
      storeViews: storeViews,
      productViews: productViews,
      productClicks: clicks,
      calls: calls,
      directionRequests: directions,
      followers: followers,
      reelViews: reelViews,
      reelLikes: reelLikes,
      reelComments: reelComments,
    );
  }
}
