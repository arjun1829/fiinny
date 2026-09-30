import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/commercial_repository.dart';
import '../data/shared_cart_repository.dart';
import '../models/cart_model.dart';
import '../models/store_commercial.dart';
import '../models/user_model.dart';
import '../utils/delivery_utils.dart';
import '../utils/gst_utils.dart';
import '../utils/weight_utils.dart';
import 'user_provider.dart';

class CartNotifier extends StateNotifier<List<CartItemModel>> {
  CartNotifier() : super([]) {
    _initialLoad = _load();
  }

  static const _key = 'cart_items';
  final _sharedCartRepo = SharedCartRepository();
  final _commercialRepo = CommercialRepository();

  /// Completes once the on-device guest cart has been read into [state].
  /// [onSignedIn] awaits this before treating [state] as "the guest cart" to
  /// merge — without it, a sign-in detected before this finishes would merge
  /// against an empty `state` and then have [_load]'s completion silently
  /// clobber the just-merged result right after.
  late final Future<void> _initialLoad;

  /// The signed-in user's phone once [onAuthChanged] has synced their cart
  /// from `carts/{phone}`; null means the current cart is a GUEST cart,
  /// persisted only to on-device SharedPreferences — mirrors web's split
  /// between localStorage (guest) and Firestore (signed in) exactly.
  String? _signedInPhone;
  Timer? _saveDebounce;

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

  /// Called once per sign-in (see `cartProvider`'s `ref.listen` below), never
  /// re-entered for the same phone. Loads the user's Firestore cart, merges
  /// it with whatever guest cart is currently in [state], persists the
  /// result back to `carts/{phone}`, and clears the on-device guest cart —
  /// mirrors web's exact login-time merge in app/page.tsx.
  Future<void> onSignedIn(String phone) async {
    if (phone.isEmpty || _signedInPhone == phone) return;
    _signedInPhone = phone;

    await _initialLoad;
    final guestItems = state;
    final remoteItems = await _sharedCartRepo.loadAndReconstruct(phone);
    final merged = remoteItems.isEmpty
        ? guestItems
        : _sharedCartRepo.mergeCartItems(guestItems, remoteItems);

    state = merged;

    if (merged.isNotEmpty || remoteItems.isNotEmpty) {
      await _sharedCartRepo.saveCart(phone, merged);
    }

    // Guest cart is now folded into the Firestore cart — clear it so a later
    // sign-out doesn't resurrect these items as a stale "guest" cart.
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  /// Called on sign-out. The in-memory cart is left as-is (still usable while
  /// browsing signed out) but future saves go back to on-device storage —
  /// this account's Firestore cart is no longer written to.
  void onSignedOut() {
    _signedInPhone = null;
  }

  Future<void> _save() async {
    final phone = _signedInPhone;
    if (phone != null) {
      // Debounced: a rapid string of quantity taps would otherwise fire one
      // Firestore write per tap.
      _saveDebounce?.cancel();
      _saveDebounce = Timer(const Duration(milliseconds: 500), () {
        // Best-effort, same as the SharedPreferences path below never
        // surfacing a disk-write failure to the UI — a dropped save here
        // just means the NEXT mutation's debounce retries with current state.
        _sharedCartRepo.saveCart(phone, state).catchError((_) {});
      });
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, CartItemModel.listToJson(state));
  }

  @override
  void dispose() {
    _saveDebounce?.cancel();
    super.dispose();
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

  /// Applies a store's GST + delivery settings to one line.
  void applyCommercial(
      String listingId, String? variantLabel, StoreCommercial c) {
    state = state.map((e) {
      if (e.listingId == listingId && e.variantLabel == variantLabel) {
        return e.copyWith(
          gstApplicable: c.gstApplicable,
          gstRate: c.gstRate,
          gstIncluded: c.gstIncluded,
          extraDeliveryCharge: c.extraDeliveryCharge,
          freeDelivery: c.freeDelivery,
        );
      }
      return e;
    }).toList();
    _save();
  }

  /// Looks up the STORE'S OWN GST + delivery settings for [item] — its product
  /// copy first, then its availability entry, then the canonical product, as
  /// the server does — and applies them to the line. GST and delivery are
  /// per store: the same product can be GST-inclusive at one shop and carry
  /// extra delivery at another. Best effort; a failed lookup keeps whatever
  /// the line already has, and the server re-derives everything at payment.
  Future<void> resolveCommercial(CartItemModel item) async {
    try {
      final c = await _commercialRepo.resolve(
        catalogId: item.catalogId,
        sellerPhone: item.sellerPhone,
      );
      if (c != null) applyCommercial(item.listingId, item.variantLabel, c);
    } catch (_) {}
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
  final notifier = CartNotifier();

  // Fold the current user's Firestore cart in on sign-in (and handle the case
  // where the app opens already signed in — ref.listen alone only fires on
  // SUBSEQUENT changes, not the value present at provider creation).
  void handle(UserModel? user) {
    final phone = user?.phone;
    if (phone != null && phone.isNotEmpty) {
      notifier.onSignedIn(phone);
    } else {
      notifier.onSignedOut();
    }
  }

  handle(ref.read(currentUserProvider).value);
  ref.listen<AsyncValue<UserModel?>>(currentUserProvider, (previous, next) {
    handle(next.value);
  });

  return notifier;
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

/// GST ADDED to what the customer pays — exclusive-GST lines only. Included
/// GST is already inside the prices and is never added.
final cartGstAddedProvider = Provider<double>((ref) {
  return round2(
      ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineGstAdded));
});

/// GST already INSIDE the cart's prices (shown as a component, not a charge).
final cartGstIncludedProvider = Provider<double>((ref) {
  return round2(ref.watch(cartProvider).fold(0.0,
      (sum, item) => sum + (item.lineGstTotal - item.lineGstAdded)));
});

// ── Delivery + GST pricing ────────────────────────────────────────────────────

/// The customer's delivery-address state — what picks a pan-India seller's
/// in-state vs out-of-state slab. Set from the checkout address (and prefilled
/// from the saved profile); empty until known, in which case sellers price on
/// their single legacy slab set, exactly like the website.
final deliveryStateProvider = StateProvider<String>((ref) => '');

/// Pricing result for the whole cart, per seller (subtotal, GST, delivery).
/// Field names of the old slab-only estimate are kept so the screens need
/// little change.
class DeliveryEstimate {
  final List<SellerPricing> sellers;
  final Map<String, double> bySellerCharge;
  final Map<String, double> bySellerWeight;
  final double totalCharge;
  final double totalWeight;

  const DeliveryEstimate({
    this.sellers = const [],
    this.bySellerCharge = const {},
    this.bySellerWeight = const {},
    this.totalCharge = 0,
    this.totalWeight = 0,
  });

  SellerPricing? forSeller(String sellerKey) {
    for (final s in sellers) {
      if (s.sellerKey == sellerKey) return s;
    }
    return null;
  }

  /// Exclusive GST added across all sellers.
  double get gstAdded => round2(sellers.fold(0.0, (s, p) => s + p.gstAdded));

  /// items + added GST + delivery, across all sellers.
  double get total => round2(sellers.fold(0.0, (s, p) => s + p.total));

  /// Whether every seller's shipment is free.
  bool get allFree => sellers.isNotEmpty && sellers.every((s) => s.delivery.free);

  /// The within / outside-state slab set that applied — only when every seller
  /// that has a state-aware set agrees, so a mixed cart shows no badge. Null
  /// for legacy single-slab sellers and when the state isn't known yet.
  DeliveryType? get slabType {
    final types = sellers
        .map((s) => s.delivery.type)
        .where((t) => t != DeliveryType.defaultSlabs)
        .toSet();
    return types.length == 1 ? types.first : null;
  }
}

final _phoneRegex = RegExp(r'^(\+91)?[6-9]\d{9}$');

/// `deliverySettings` docs are keyed by phone, but some legacy retailer copies
/// only carry the seller's Firebase UID in the phone-ish fields. If [candidate]
/// isn't already a valid phone, resolve it via `uidIndex/{uid}.phone` — the
/// web's 3-tier lookup (stored phone → uidIndex → treat-as-phone).
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

/// Computes each seller's subtotal, GST and delivery with the same rules as the
/// website and the server (core/utils/gst_utils + delivery_utils): store
/// settings from the cart line, slab by the customer's state. The server
/// recomputes all of it at payment; this is the estimate shown before paying.
final deliveryChargeProvider = FutureProvider<DeliveryEstimate>((ref) async {
  final items = ref.watch(cartProvider);
  final customerState = ref.watch(deliveryStateProvider);
  if (items.isEmpty) return const DeliveryEstimate();

  final groups = <String, List<CartItemModel>>{};
  for (final item in items) {
    groups.putIfAbsent(item.sellerPhone, () => []).add(item);
  }

  final db = FirebaseFirestore.instance;
  final sellers = <SellerPricing>[];
  final charges = <String, double>{};
  final weights = <String, double>{};

  for (final entry in groups.entries) {
    final sellerKey = entry.key;
    final sellerItems = entry.value;

    final lines = [
      for (final i in sellerItems)
        CartPricingLine(
          sellerKey: sellerKey,
          unitPrice: i.price,
          qty: i.quantity,
          weightKg: round3(i.quantity * parseVariantWeightKg(i.variantLabel)),
          gstApplicable: i.gstApplicable,
          gstRate: i.gstRate,
          gstIncluded: i.gstIncluded,
          extraDeliveryCharge: i.extraDeliveryCharge,
          freeDelivery: i.freeDelivery,
        ),
    ];
    // Whole-shipment weight — shown to the buyer as the estimate.
    weights[sellerKey] = round3(lines.fold(0.0, (s, l) => s + l.weightKg));

    // The seller's delivery settings; null (missing / unreadable / no phone)
    // means only the per-product extra applies, as on the website.
    Map<String, dynamic>? settings;
    final phone = await _resolveSellerPhone(sellerKey);
    if (phone != null) {
      try {
        final snap = await db.collection('deliverySettings').doc(phone).get();
        settings = snap.data();
      } catch (e) {
        debugPrint('[DeliveryEstimate] settings read failed for $phone: $e');
      }
    }

    final pricing =
        computeSellerPricing(sellerKey, lines, settings, customerState);
    sellers.add(pricing);
    charges[sellerKey] = pricing.deliveryCharge;
    debugPrint('[DeliveryEstimate] $sellerKey state="$customerState" '
        'type=${pricing.delivery.type.value} slab=${pricing.delivery.slab} '
        'extra=${pricing.delivery.extra} free=${pricing.delivery.free} '
        'gstAdded=${pricing.gstAdded}');
  }

  return DeliveryEstimate(
    sellers: sellers,
    bySellerCharge: charges,
    bySellerWeight: weights,
    totalCharge: round2(charges.values.fold(0.0, (s, v) => s + v)),
    totalWeight: round3(weights.values.fold(0.0, (s, v) => s + v)),
  );
});
