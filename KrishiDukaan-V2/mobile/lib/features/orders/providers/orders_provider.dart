import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/order_model.dart';
import '../data/order_repository.dart';

final orderRepositoryProvider = Provider((_) => OrderRepository());

final customerOrdersProvider = StreamProvider<List<OrderModel>>((ref) {
  return ref.read(orderRepositoryProvider).watchCustomerOrders();
});

final orderDetailProvider =
    FutureProvider.family<OrderModel?, String>((ref, orderId) {
  return ref.read(orderRepositoryProvider).fetchById(orderId);
});
