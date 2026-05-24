import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/models.dart';

class CartItem {
  const CartItem({required this.product, required this.qty});
  final Product product;
  final int qty;

  CartItem copyWith({int? qty}) =>
      CartItem(product: product, qty: qty ?? this.qty);

  int get subtotalInr => product.priceInr * qty;
}

class CartState {
  const CartState({this.items = const {}});
  final Map<String, CartItem> items;

  int get totalQty =>
      items.values.fold(0, (sum, item) => sum + item.qty);

  int get totalInr =>
      items.values.fold(0, (sum, item) => sum + item.subtotalInr);

  bool get isEmpty => items.isEmpty;

  List<CartItem> get list => items.values.toList(growable: false);
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier() : super(const CartState());

  void add(Product p, {int qty = 1}) {
    final next = Map<String, CartItem>.from(state.items);
    final existing = next[p.id];
    next[p.id] = existing == null
        ? CartItem(product: p, qty: qty)
        : existing.copyWith(qty: existing.qty + qty);
    state = CartState(items: next);
  }

  void setQty(String productId, int qty) {
    final next = Map<String, CartItem>.from(state.items);
    if (qty <= 0) {
      next.remove(productId);
    } else {
      final existing = next[productId];
      if (existing != null) next[productId] = existing.copyWith(qty: qty);
    }
    state = CartState(items: next);
  }

  void remove(String productId) {
    final next = Map<String, CartItem>.from(state.items)..remove(productId);
    state = CartState(items: next);
  }

  void clear() => state = const CartState();
}

final cartProvider =
    StateNotifierProvider<CartNotifier, CartState>((_) => CartNotifier());
