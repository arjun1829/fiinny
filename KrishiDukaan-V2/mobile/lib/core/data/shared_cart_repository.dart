import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/cart_model.dart';
import '../models/store_commercial.dart';
import 'commercial_repository.dart';

/// Mirrors web's `carts/{phone}` collection (app/cartService.ts) so the same
/// signed-in user's cart is shared between the mobile app and the website —
/// previously mobile only ever persisted to on-device SharedPreferences, so a
/// product added on one platform never appeared on the other.
///
/// Schema written/read here matches web's `StoredCartItem` field-for-field:
/// productId, storeId, sellerPhone, sellerName, variantUnit, quantity,
/// sellerType, sellingPrice, originalPrice, discountPct — plus the store's own
/// GST + delivery settings (gstApplicable, gstRate, gstIncluded,
/// extraDeliveryCharge, freeDelivery), written exactly as the web writes them.
/// Dropping those on save would erase what the website captured for the same
/// cart, so a cart that moves between web and app keeps the buyer's price and
/// GST intact.
class SharedCartRepository {
  final _db = FirebaseFirestore.instance;
  final _commercial = CommercialRepository();

  Future<void> saveCart(String phone, List<CartItemModel> items) async {
    if (phone.isEmpty) return;
    await _db.collection('carts').doc(phone).set({
      'phone': phone,
      'updatedAt': FieldValue.serverTimestamp(),
      'items': items.map(_toStoredItem).toList(),
    });
  }

  Map<String, dynamic> _toStoredItem(CartItemModel item) => {
        'productId': item.catalogId,
        // Mobile's cart identity is always a phone (never a bare Auth UID),
        // so storeId and sellerPhone are the same value here — unlike web,
        // which can key storeId by UID for legacy items.
        'storeId': item.sellerPhone,
        'sellerPhone': item.sellerPhone,
        if (item.sellerName.isNotEmpty) 'sellerName': item.sellerName,
        'variantUnit': item.variantLabel ?? '',
        'quantity': item.quantity,
        // Mobile's CartItemModel doesn't track retailer-vs-manufacturer per
        // line — matches web's own fallback (`item.sellerType ?? 'retailer'`)
        // for items that never set it either. Cosmetic only: real checkout
        // resolves seller type freshly from the product doc, never from this
        // shared-cart snapshot.
        'sellerType': 'retailer',
        'sellingPrice': item.price,
        if (item.hasDiscount) 'originalPrice': item.originalPrice,
        if (item.discountPct > 0) 'discountPct': item.discountPct,
        // The store's own commercial settings, as the web's toStoredItem
        // writes them: gstIncluded is an explicit boolean whenever GST applies
        // (so an exclusive line survives a reload), the rest only when set.
        if (item.gstApplicable) 'gstApplicable': true,
        if (item.gstRate > 0) 'gstRate': item.gstRate,
        if (item.gstApplicable) 'gstIncluded': item.gstIncluded,
        if (item.extraDeliveryCharge > 0)
          'extraDeliveryCharge': item.extraDeliveryCharge,
        if (item.freeDelivery) 'freeDelivery': true,
      };

  /// Loads `carts/{phone}` and reconstructs full [CartItemModel]s by fetching
  /// each item's live product doc for name/image/GST.
  ///
  /// Deliberate simplification vs. web's `reconstructCartItems`: web falls
  /// back through ~150 lines of seller-copy-price / name-matching discount
  /// resolution for a LEGACY item saved before pricing was persisted at
  /// add-to-cart time. That fallback chain only matters for pre-migration
  /// carts — every item saved by either platform going forward always
  /// carries `sellingPrice`, which is used directly here. A legacy item
  /// missing it falls back to the product's plain base price rather than
  /// reimplementing that whole chain — a far smaller risk than a subtly
  /// wrong port of it.
  ///
  /// A "pending" web cart item (no store chosen yet, `storeId: ''`) is
  /// dropped rather than reconstructed: mobile's [CartItemModel] has no
  /// representation for a storeless line (`sellerPhone`/`sellerName` are
  /// required fields — mobile always resolves a store before adding to
  /// cart), so a customer who added an item on web without picking a store
  /// yet won't see that specific line on mobile until they pick one on web.
  Future<List<CartItemModel>> loadAndReconstruct(String phone) async {
    if (phone.isEmpty) return [];
    try {
      final snap = await _db.collection('carts').doc(phone).get();
      if (!snap.exists) return [];
      final data = snap.data();
      final rawItems = data?['items'];
      if (rawItems is! List || rawItems.isEmpty) return [];

      final stored = rawItems.whereType<Map<String, dynamic>>().toList();
      final productIds = stored
          .map((i) => (i['productId'] as String?) ?? '')
          .where((s) => s.isNotEmpty)
          .toSet()
          .toList();
      if (productIds.isEmpty) return [];

      Future<DocumentSnapshot<Map<String, dynamic>>?> fetchProduct(String id) async {
        try {
          return await _db.collection('products').doc(id).get();
        } catch (_) {
          return null;
        }
      }

      final productDocs = await Future.wait(productIds.map(fetchProduct));
      final productMap = <String, Map<String, dynamic>>{};
      for (final doc in productDocs) {
        if (doc == null || !doc.exists) continue;
        final d = doc.data();
        if (d != null) productMap[doc.id] = d;
      }

      // A stored line that carries ANY commercial field keeps exactly those
      // (what the buyer saw when they added it — the web's rule). A line with
      // none (older carts, or ones an older app build saved) is resolved from
      // the store's own copy, then its availability entry, then the product.
      final commercialFor = <int, StoreCommercial>{};
      await Future.wait([
        for (var i = 0; i < stored.length; i++)
          () async {
            final item = stored[i];
            if (StoreCommercial.hasAny(item)) {
              commercialFor[i] = StoreCommercial.fromMap(item);
              return;
            }
            final productId = (item['productId'] as String?) ?? '';
            final phone = (item['sellerPhone'] as String?) ??
                (item['storeId'] as String?) ??
                '';
            if (productId.isEmpty || phone.isEmpty) return;
            final resolved = await _commercial.resolve(
              catalogId: productId,
              sellerPhone: phone,
              canonical: productMap[productId],
            );
            if (resolved != null) commercialFor[i] = resolved;
          }(),
      ]);

      final result = <CartItemModel>[];
      for (var idx = 0; idx < stored.length; idx++) {
        final item = stored[idx];
        final productId = (item['productId'] as String?) ?? '';
        final product = productMap[productId];
        if (product == null) continue; // product no longer exists

        final storeId = (item['storeId'] as String?) ?? '';
        final sellerPhone = (item['sellerPhone'] as String?) ?? storeId;
        if (sellerPhone.isEmpty) continue; // pending item — see doc comment

        final images = product['images'];
        final image = images is List && images.isNotEmpty
            ? images.first?.toString()
            : (product['image'] as String?);
        final basePrice = (product['price'] as num?)?.toDouble() ?? 0;
        final sellingPrice = (item['sellingPrice'] as num?)?.toDouble();
        final price = (sellingPrice != null && sellingPrice > 0) ? sellingPrice : basePrice;
        final originalPrice = (item['originalPrice'] as num?)?.toDouble();
        final variantUnit = (item['variantUnit'] as String?) ?? '';
        final sellerName = (item['sellerName'] as String?) ?? '';

        result.add(CartItemModel(
          catalogId: productId,
          catalogName: (product['name'] as String?) ?? '',
          catalogImage: image,
          // No per-store listing doc id survives this minimal schema — see
          // the class doc comment on why catalogId here is safe rather than
          // risky: the reliable stock-decrement path in
          // functions/src/index.ts's decrementStockOnOrder resolves the
          // seller's copy via catalogId + the order's own sellerPhone, not
          // via listingId, so this never breaks stock tracking.
          listingId: productId,
          sellerPhone: sellerPhone,
          sellerName: sellerName.isNotEmpty ? sellerName : sellerPhone,
          price: price,
          originalPrice: (originalPrice != null && originalPrice > 0) ? originalPrice : price,
          discountPct: (item['discountPct'] as num?)?.toDouble() ?? 0,
          quantity: (item['quantity'] as num?)?.toInt() ?? 1,
          variantLabel: variantUnit.isNotEmpty ? variantUnit : null,
          gstApplicable: commercialFor[idx]?.gstApplicable ?? false,
          gstRate: commercialFor[idx]?.gstRate ?? 0,
          gstIncluded: commercialFor[idx]?.gstIncluded ?? true,
          extraDeliveryCharge: commercialFor[idx]?.extraDeliveryCharge ?? 0,
          freeDelivery: commercialFor[idx]?.freeDelivery ?? false,
        ));
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  /// Sums quantities for items matching on productId + storeId + variant —
  /// mirrors web's `mergeCartItems` exactly, used when a guest cart (local
  /// only) meets a signed-in cart (Firestore) on login.
  List<CartItemModel> mergeCartItems(
    List<CartItemModel> local,
    List<CartItemModel> fromFirestore,
  ) {
    final merged = List<CartItemModel>.from(local);
    for (final remote in fromFirestore) {
      final idx = merged.indexWhere((i) =>
          i.catalogId == remote.catalogId &&
          i.sellerPhone == remote.sellerPhone &&
          i.variantLabel == remote.variantLabel);
      if (idx >= 0) {
        merged[idx] =
            merged[idx].copyWith(quantity: merged[idx].quantity + remote.quantity);
      } else {
        merged.add(remote);
      }
    }
    return merged;
  }
}
