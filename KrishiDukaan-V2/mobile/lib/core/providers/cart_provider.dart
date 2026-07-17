import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cart_model.dart';
import '../utils/weight_utils.dart';

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

  /// Re-points a cart line to a different store, applying that store's price and
  /// discount. If the target store is already a separate line for the same
  /// product + variant, the two lines are merged (quantities summed) so we never
  /// end up with two lines for the same listing.
  void updateStore(
    CartItemModel item, {
    required String listingId,
    required String sellerPhone,
    required String sellerName,
    required double price,
    required double originalPrice,
    required double discountPct,
  }) {
    final updated = item.copyWith(
      listingId: listingId,
      sellerPhone: sellerPhone,
      sellerName: sellerName,
      price: price,
      originalPrice: originalPrice,
      discountPct: discountPct,
    );
    final result = <CartItemModel>[];
    for (final e in state) {
      final isTarget =
          e.listingId == item.listingId && e.variantLabel == item.variantLabel;
      final candidate = isTarget ? updated : e;
      final existing = result.indexWhere((r) =>
          r.listingId == candidate.listingId &&
          r.variantLabel == candidate.variantLabel);
      if (existing >= 0) {
        result[existing] = result[existing]
            .copyWith(quantity: result[existing].quantity + candidate.quantity);
      } else {
        result.add(candidate);
      }
    }
    state = result;
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

/// Total money saved across the cart from store discounts (sum of line savings).
final cartSavingsProvider = Provider<double>((ref) {
  return ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineSavings);
});

/// Total GST across the cart.
final cartGstProvider = Provider<double>((ref) {
  return ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineGst);
});

// ── Delivery charge estimation ────────────────────────────────────────────────

/// Weight slab from `deliverySettings/{sellerPhone}`.
class WeightSlab {
  final double minKg;
  final double maxKg;
  final double charge;
  const WeightSlab({required this.minKg, required this.maxKg, required this.charge});

  factory WeightSlab.fromMap(Map<String, dynamic> m) => WeightSlab(
        minKg: (m['minKg'] as num).toDouble(),
        maxKg: (m['maxKg'] as num).toDouble(),
        charge: (m['charge'] as num).toDouble(),
      );
}

/// Delivery estimate result per seller.
class DeliveryEstimate {
  final Map<String, double> bySellerCharge;
  final Map<String, double> bySellerWeight;
  final double totalCharge;
  final double totalWeight;

  const DeliveryEstimate({
    this.bySellerCharge = const {},
    this.bySellerWeight = const {},
    this.totalCharge = 0,
    this.totalWeight = 0,
  });
}

final _phoneRegex = RegExp(r'^(\+91)?[6-9]\d{9}$');

/// `deliverySettings` docs are keyed by phone, but some legacy retailer copies
/// only carry the seller's Firebase UID in the phone-ish fields (see the
/// "UIDs leak into sellerPhone on some legacy docs" note in product_detail_
/// screen.dart). If [candidate] isn't already a valid phone, resolve it via
/// `uidIndex/{uid}.phone` — mirrors the web's `useDeliveryEstimates` 3-tier
/// lookup (stored phone → uidIndex → treat-as-phone), which is why the web
/// charges delivery for sellers whose mobile-side sellerPhone lookup was
/// silently coming up empty.
Future<String?> _resolveSellerPhone(String candidate) async {
  final cleaned = candidate.replaceAll(RegExp(r'\s'), '');
  if (_phoneRegex.hasMatch(cleaned)) return cleaned;
  if (candidate.isEmpty) return null;

  try {
    final idxSnap = await FirebaseFirestore.instance
        .collection('uidIndex')
        .doc(candidate)
        .get();
    final phone = idxSnap.data()?['phone'] as String?;
    if (phone != null && phone.isNotEmpty) return phone;
  } catch (_) {}

  return null;
}

/// Async provider that computes delivery charges from Firestore `deliverySettings`.
/// Mirrors the web app's `useDeliveryEstimator` hook.
final deliveryChargeProvider = FutureProvider<DeliveryEstimate>((ref) async {
  final items = ref.watch(cartProvider);
  if (items.isEmpty) return const DeliveryEstimate();

  // Group by seller phone
  final groups = <String, List<CartItemModel>>{};
  for (final item in items) {
    groups.putIfAbsent(item.sellerPhone, () => []).add(item);
  }

  final db = FirebaseFirestore.instance;
  final charges = <String, double>{};
  final weights = <String, double>{};

  for (final entry in groups.entries) {
    final sellerKey = entry.key;
    final sellerItems = entry.value;

    // Compute total weight for this seller
    double weightKg = 0;
    for (final item in sellerItems) {
      weightKg += item.quantity * parseVariantWeightKg(item.variantLabel);
    }
    weightKg = double.parse(weightKg.toStringAsFixed(3));
    weights[sellerKey] = weightKg;

    debugPrint('[DeliveryEstimate] seller: $sellerKey | weightKg: $weightKg | '
        'items: ${sellerItems.map((i) => '${i.catalogName}×${i.quantity} variantLabel="${i.variantLabel}"').join(', ')}');

    if (weightKg == 0) {
      debugPrint('[DeliveryEstimate] weight=0, no delivery charge applied');
      charges[sellerKey] = 0;
      continue;
    }

    // Resolve the actual deliverySettings doc ID — sellerKey may be a UID on
    // legacy retailer copies rather than the phone deliverySettings is keyed by.
    final phone = await _resolveSellerPhone(sellerKey);
    debugPrint('[DeliveryEstimate] resolved phone for $sellerKey → $phone');
    if (phone == null) {
      debugPrint('[DeliveryEstimate] could not resolve phone for seller: $sellerKey');
      charges[sellerKey] = 0;
      continue;
    }

    try {
      final settingsSnap =
          await db.collection('deliverySettings').doc(phone).get();
      debugPrint('[DeliveryEstimate] deliverySettings doc exists: '
          '${settingsSnap.exists} for phone: $phone');
      if (!settingsSnap.exists) {
        charges[sellerKey] = 0;
        continue;
      }

      final data = settingsSnap.data()!;
      final slabsList = data['weightSlabs'] as List<dynamic>?;
      debugPrint('[DeliveryEstimate] slabs: $slabsList');
      if (slabsList == null || slabsList.isEmpty) {
        charges[sellerKey] = 0;
        continue;
      }

      final slabs = slabsList
          .map((s) => WeightSlab.fromMap(s as Map<String, dynamic>))
          .toList()
        ..sort((a, b) => a.minKg.compareTo(b.minKg));

      double charge = 0;
      for (final slab in slabs) {
        if (weightKg >= slab.minKg && weightKg < slab.maxKg) {
          charge = slab.charge;
          debugPrint('[DeliveryEstimate] matched slab: '
              '${slab.minKg}-${slab.maxKg} → charge: $charge');
          break;
        }
      }
      // Open-ended last slab fallback
      if (charge == 0 && slabs.isNotEmpty) {
        final last = slabs.last;
        if (weightKg >= last.minKg) {
          charge = last.charge;
          debugPrint('[DeliveryEstimate] last-slab fallback → charge: $charge');
        }
      }
      if (charge == 0) {
        debugPrint('[DeliveryEstimate] no slab matched weightKg=$weightKg, slabs=$slabs');
      }
      charges[sellerKey] = charge;
    } catch (e) {
      debugPrint('[DeliveryEstimate] fetch error: $e');
      charges[sellerKey] = 0;
    }
  }

  debugPrint('[DeliveryEstimate] final charges: $charges | weights: $weights');

  final totalCharge = charges.values.fold(0.0, (s, v) => s + v);
  final totalWeight = weights.values.fold(0.0, (s, v) => s + v);

  return DeliveryEstimate(
    bySellerCharge: charges,
    bySellerWeight: weights,
    totalCharge: totalCharge,
    totalWeight: totalWeight,
  );
});
