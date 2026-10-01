import 'package:flutter_riverpod/flutter_riverpod.dart';
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
import '../../orders/data/order_repository.dart';

final _repo = DashboardRepository();

final dashboardStatsProvider =
    FutureProvider.family<Map<String, int>, String>((ref, phone) {
  return _repo.fetchStats(phone);
});

final myListingsProvider =
    StreamProvider.family<List<ListingModel>, String>((ref, phone) {
  return _repo.watchMyListings(phone);
});

final sellerOrdersProvider =
    StreamProvider.family<List<OrderModel>, String>((ref, phone) {
  return _repo.watchSellerOrders(phone);
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

/// Live orders where the current user is the seller — the raw input to the
/// earnings math.
final sellerPayoutOrdersProvider = StreamProvider<List<OrderModel>>((ref) {
  return OrderRepository().watchSellerOrders();
});

/// What the seller is owed, on hold, awaiting delivery, and already paid.
///
/// Derived from the same order documents the seller already sees, using the
/// exact rules the web dashboard and the payout run use, so the app can never
/// quote a different figure than the money that actually moves.
final sellerEarningsProvider = Provider<AsyncValue<SellerEarnings>>((ref) {
  return ref
      .watch(sellerPayoutOrdersProvider)
      .whenData((orders) => computeSellerEarnings(orders));
});
