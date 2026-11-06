import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/cart_model.dart';
import 'package:krishidukaan_app/core/utils/weight_utils.dart';
import 'package:krishidukaan_app/features/cart/data/server_priced_items.dart';

void main() {
  test('weights parse loose unit spellings', () {
    expect(
      ['1kg', '500g', '2L', '250ml', '5 Ltr', '500 gms', '1 kgs', 'bottle']
          .map(parseVariantWeightKg)
          .toList(),
      [1, 0.5, 2, 0.25, 5, 0.5, 1, 0],
    );
  });

  test('order lines take the price the server charged', () {
    final item = CartItemModel(
      catalogId: 'p',
      catalogName: 'Arjuna',
      listingId: 'l',
      sellerPhone: '+919000000001',
      sellerName: 'A Agro',
      price: 200,
      originalPrice: 250,
      quantity: 1,
      variantLabel: '5 Ltr',
    );
    final out = withServerPrices([item], [
      {'productId': 'p', 'unitPrice': 900, 'variantUnit': '5L', 'sellerPhone': '9000000001'},
    ]).single;
    expect(out.price, 900);
    expect(out.hasDiscount, isFalse);

    final discounted = withServerPrices([item], [
      {'productId': 'p', 'unitPrice': 225, 'variantUnit': '5L', 'sellerPhone': '9000000001'},
    ]).single;
    expect(discounted.price, 225);
    expect(discounted.originalPrice, 250);

    expect(withServerPrices([item], [
      {'productId': 'other', 'unitPrice': 900},
    ]).single.price, 200);
  });
}
