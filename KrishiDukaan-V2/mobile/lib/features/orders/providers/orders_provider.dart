import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/data/paged_feed.dart';
import '../../../core/models/order_model.dart';
import '../data/order_repository.dart';

final orderRepositoryProvider = Provider((_) => OrderRepository());

/// The user's orders newest first: the first 30 live, older pages on
/// [PagedFeed.loadMore].
final customerOrdersFeedProvider = Provider<PagedFeed<OrderModel>>((ref) {
  final feed = ref.read(orderRepositoryProvider).customerOrdersFeed();
  ref.onDispose(feed.dispose);
  return feed;
});

final customerOrdersProvider = StreamProvider<List<OrderModel>>((ref) {
  return ref.watch(customerOrdersFeedProvider).stream;
});

final orderDetailProvider =
    FutureProvider.family<OrderModel?, String>((ref, orderId) {
  return ref.read(orderRepositoryProvider).fetchById(orderId);
});
