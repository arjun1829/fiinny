import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';
import '../data/dashboard_repository.dart';

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

final deliverySettingsProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, phone) {
  return _repo.fetchDeliverySettings(phone);
});

final dashboardRepoProvider = Provider((_) => _repo);

/// Real seat stats from subscriptions + retailerSeatListings.
/// Matches web's computeSeatStats logic exactly.
final seatStatsProvider =
    FutureProvider.family<SeatStats, String>((ref, phone) {
  return _repo.fetchSeatStats(phone);
});
