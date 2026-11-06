import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/data/paged_feed.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';
import '../data/dashboard_repository.dart';
import '../data/order_offers_repository.dart';
import '../data/store_analytics.dart';
import '../../../core/data/product_schema_repository.dart';
import '../../../core/models/subscription_model.dart';
import '../../../core/models/payout_account_model.dart';
import '../data/payout_repository.dart';
import '../data/seller_earnings.dart';
import '../../../core/session/shop_session.dart';

final _repo = DashboardRepository();

final dashboardStatsProvider =
    FutureProvider.family<Map<String, int>, String>((ref, phone) {
  return _repo.fetchStats(phone);
});

final myListingsProvider =
    StreamProvider.family<List<ListingModel>, String>((ref, phone) {
  return _repo.watchMyListings(phone);
});

/// Keyed by the comma-joined, sorted product ids so it only refetches when
/// the seller's set of listings changes, not on every listing update.
final productStatsTotalsProvider =
    FutureProvider.family<Map<String, int>, String>((ref, idsKey) {
  final ids = idsKey.isEmpty ? <String>[] : idsKey.split(',');
  return _repo.fetchProductStatsTotals(ids);
});

/// The seller's orders, newest first: the first 30 live, older pages on
/// [PagedFeed.loadMore] (see the screens' "Load more").
final sellerOrdersFeedProvider =
    Provider.family<PagedFeed<OrderModel>, String>((ref, phone) {
  final feed = _repo.sellerOrdersFeed(phone);
  ref.onDispose(feed.dispose);
  return feed;
});

final sellerOrdersProvider =
    StreamProvider.family<List<OrderModel>, String>((ref, phone) {
  return ref.watch(sellerOrdersFeedProvider(phone)).stream;
});

/// All-time order counts and revenue for the seller (stats docs kept by a
/// Cloud Function), for the tiles and tab counts.
final sellerOrderTotalsProvider =
    FutureProvider.family<SellerOrderTotals, String>((ref, phone) {
  return _repo.fetchSellerOrderTotals(phone);
});

/// The seller's orders in a date window, for the analytics screen.
final sellerOrdersInRangeProvider = FutureProvider.family<List<OrderModel>,
    ({String phone, DateTime start, DateTime? end})>((ref, arg) {
  return _repo.fetchSellerOrdersInRange(arg.phone, arg.start, arg.end);
});

final orderOffersRepoProvider = Provider((_) => OrderOffersRepository());

/// Orders other sellers rejected, open for this seller to take (Requests tab).
final openOrderOffersProvider =
    StreamProvider.family<List<OrderOfferModel>, String>((ref, phone) {
  return ref.watch(orderOffersRepoProvider).watchOpenOffers(phone);
});

final deliverySettingsProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, phone) {
  return _repo.fetchDeliverySettings(phone);
});

final dashboardRepoProvider = Provider((_) => _repo);

final _storeAnalyticsRepo = StoreAnalyticsRepository();

/// Reach/engagement stats behind the Analytics screen, scoped to a period —
/// or to [customRange] when the Custom Date Range filter is active, which
/// overrides [period]. The record type itself is the cache key, so picking a
/// new range (or period) always refetches rather than reusing stale numbers.
final storeAnalyticsProvider = FutureProvider.family<StoreAnalytics,
    ({String phone, AnalyticsPeriod period, AnalyticsRange? customRange})>(
        (ref, arg) {
  return _storeAnalyticsRepo.fetch(arg.phone, arg.period,
      customRange: arg.customRange);
});

/// Real seat stats from subscriptions + retailerSeatListings.
/// Matches web's computeSeatStats logic exactly.
final seatStatsProvider =
    FutureProvider.family<SeatStats, String>((ref, phone) {
  return _repo.fetchSeatStats(phone);
});

/// The shared product category + Category Info schema from
/// `settings/productSchema`, so the Add/Edit Product form offers exactly the
/// categories the web dashboard does. Falls back to a bundled copy when the
/// doc can't be read — see ProductSchemaRepository.fallback.
final productSchemaProvider = FutureProvider<ProductSchema>((ref) {
  return ProductSchemaRepository().fetch();
});

/// Full subscription purchase history for a seller, newest first.
final subscriptionHistoryProvider =
    FutureProvider.family<List<SubscriptionModel>, String>((ref, phone) {
  return _repo.fetchSubscriptionHistory(phone);
});

/// Seat listings currently consuming this seller's seats, product-hydrated.
final activeSeatListingsProvider =
    FutureProvider.family<List<SeatListingModel>, String>((ref, phone) {
  return _repo.fetchActiveSeatListings(phone);
});

// ─── Payouts ────────────────────────────────────────────────────────────────

final payoutRepoProvider = Provider((_) => PayoutRepository());

/// The seller's saved bank account, or null if they have not set one up.
final payoutAccountProvider = FutureProvider<PayoutAccountModel?>((ref) {
  return ref.watch(payoutRepoProvider).fetch();
});

/// True while the seller's payout details aren't verified, so the payment
/// timeline says money waits for KYC. False until known.
final kycPendingProvider = Provider<bool>((ref) {
  final a = ref.watch(payoutAccountProvider);
  return a.hasValue && !(a.value?.isVerified ?? false);
});

/// The signed-in seller's earnings totals and recent holds (stats docs kept
/// by a Cloud Function), live.
final sellerEarningsStatsProvider = StreamProvider<
    ({Map<String, double> totals, List<EarningsHold> holds})>((ref) {
  final phone = ShopSession.sellerPhone();
  return _repo.watchSellerEarningsStats(phone);
});

/// What the seller is owed, on hold, awaiting delivery, and already paid.
///
/// Totals from the server-kept stats, which apply the exact rules the web
/// dashboard and the payout run use, so the app can never quote a different
/// figure than the money that actually moves; the order-by-order list from
/// the newest orders (the same live list as the Orders screen).
final sellerEarningsProvider = Provider<AsyncValue<SellerEarnings>>((ref) {
  final phone = ShopSession.sellerPhone();
  final recent = ref.watch(sellerOrdersProvider(phone)).value ?? const <OrderModel>[];
  return ref.watch(sellerEarningsStatsProvider).whenData((s) => earningsFromStats(
        s.totals,
        s.holds,
        rows: computeSellerEarnings(recent).rows,
      ));
});
