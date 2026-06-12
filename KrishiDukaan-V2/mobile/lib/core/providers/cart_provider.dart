import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cart_model.dart';

class CartNotifier extends StateNotifier<List<CartItemModel>> {
  CartNotifier() : super([]) {
    _load();
  }

  static const _key = 'cart_items';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_key);
    if (json != null && json.isNotEmpty) {
      try {
        state = CartItemModel.listFromJson(json);
      } catch (_) {
        state = [];
      }
    }
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, CartItemModel.listToJson(state));
  }

  void addItem(CartItemModel item) {
    // If same listing already in cart, increment quantity
    final idx = state.indexWhere(
      (e) => e.listingId == item.listingId && e.variantLabel == item.variantLabel,
    );
    if (idx >= 0) {
      final updated = List<CartItemModel>.from(state);
      updated[idx] = updated[idx].copyWith(quantity: updated[idx].quantity + item.quantity);
      state = updated;
    } else {
      state = [...state, item];
    }
    _save();
  }

  void removeItem(String listingId, String? variantLabel) {
    state = state
        .where((e) => !(e.listingId == listingId && e.variantLabel == variantLabel))
        .toList();
    _save();
  }

  void updateQuantity(String listingId, String? variantLabel, int qty) {
    if (qty <= 0) {
      removeItem(listingId, variantLabel);
      return;
    }
    state = state.map((e) {
      if (e.listingId == listingId && e.variantLabel == variantLabel) {
        return e.copyWith(quantity: qty);
      }
      return e;
    }).toList();
    _save();
  }

  void clear() {
    state = [];
    _save();
  }
}

final cartProvider =
    StateNotifierProvider<CartNotifier, List<CartItemModel>>((ref) {
  return CartNotifier();
});

final cartCountProvider = Provider<int>((ref) {
  return ref.watch(cartProvider).fold(0, (sum, item) => sum + item.quantity);
});

final cartTotalProvider = Provider<double>((ref) {
  return ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineTotal);
});
