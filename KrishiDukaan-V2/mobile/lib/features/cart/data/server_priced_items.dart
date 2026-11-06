import '../../../core/models/cart_model.dart';
import '../../../core/utils/weight_utils.dart';

String _ten(Object? v) {
  final d = (v ?? '').toString().replaceAll(RegExp(r'\D'), '');
  return d.length >= 10 ? d.substring(d.length - 10) : d;
}

/// The cart with each line priced at what /api/payment/create-cart-order
/// CHARGED for it (its `items`), so the order record matches the payment.
/// A line now priced at or above its old MRP drops the struck price; lines
/// the server didn't return are left as they are. Same as the website's
/// app/lib/server-priced-items.ts.
List<CartItemModel> withServerPrices(
  List<CartItemModel> items,
  Object? serverItems,
) {
  if (serverItems is! List || serverItems.isEmpty) return items;
  final server = serverItems.whereType<Map>().toList();
  final used = <int>{};
  return items.map((item) {
    final idx = server.indexWhere((s) {
      if (used.contains(server.indexOf(s))) return false;
      if (s['productId'] != item.catalogId) return false;
      if (normalizeUnit(s['variantUnit']?.toString()) !=
          normalizeUnit(item.variantLabel)) {
        return false;
      }
      final phone = _ten(s['sellerPhone']);
      return (phone.isNotEmpty && phone == _ten(item.sellerPhone)) ||
          s['sellerId'] == item.sellerPhone;
    });
    if (idx < 0) return item;
    used.add(idx);
    final price = (server[idx]['unitPrice'] as num?)?.toDouble() ?? 0;
    if (price <= 0 || (price - item.price).abs() < 0.005) return item;
    final mrp = item.originalPrice > price ? item.originalPrice : price;
    return item.copyWith(
      price: price,
      originalPrice: mrp,
      discountPct: mrp > price ? ((1 - price / mrp) * 100).roundToDouble() : 0,
    );
  }).toList();
}
