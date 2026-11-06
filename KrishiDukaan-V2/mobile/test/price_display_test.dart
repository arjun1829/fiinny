import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/catalog_model.dart';
import 'package:krishidukaan_app/core/utils/price_display.dart';

CatalogModel _catalog({
  double price = 120,
  List<AvailabilityEntry>? availability,
  double? lowestPrice,
  double? lowestFinalPrice,
  double maxDiscountPct = 0,
}) =>
    CatalogModel(
      id: 'p1',
      name: 'Arjuna',
      nameSearch: const ['arjuna'],
      category: 'bio',
      images: const ['x'],
      price: price,
      sellerCount: 1,
      availability: availability,
      lowestPrice: lowestPrice,
      lowestFinalPrice: lowestFinalPrice,
      maxDiscountPct: maxDiscountPct,
    );

void main() {
  group('DisplayPrice', () {
    test('exact percentages do not floor down on float error', () {
      for (final pct in [5, 10, 15, 20, 25, 30, 50, 70]) {
        for (final base in [99.0, 100.0, 349.0, 1250.0, 99900.0]) {
          final dp = DisplayPrice.seller(base, pct.toDouble());
          expect(dp.pct, pct, reason: '$pct% of $base');
          expect(dp.mrp, base);
        }
      }
    });

    test('under 1% is not an offer', () {
      final dp = DisplayPrice.of(996, 1000);
      expect(dp.hasOffer, isFalse);
      expect(dp.mrp, isNull);
    });

    test('rounds the badge down, never overstating the saving', () {
      expect(DisplayPrice.of(86999, 99900).pct, 12);
    });
  });

  group('CatalogModel.displayPrice', () {
    test('cheapest seller without a discount shows no struck price', () {
      final dp = _catalog(availability: const [
        AvailabilityEntry(storeId: 'a', sellingPrice: 100),
        AvailabilityEntry(storeId: 'b', sellingPrice: 120, discountPct: 10),
      ]).displayPrice;
      expect(dp.price, 100);
      expect(dp.hasOffer, isFalse);
    });

    test('struck price belongs to the same seller as the final price', () {
      final dp = _catalog(availability: const [
        AvailabilityEntry(storeId: 'a', sellingPrice: 100),
        AvailabilityEntry(storeId: 'b', sellingPrice: 120, discountPct: 25),
      ]).displayPrice;
      expect(dp.price, 90);
      expect(dp.mrp, 120);
      expect(dp.pct, 25);
    });

    test('falls back to the card fields without availability', () {
      final dp =
          _catalog(lowestPrice: 150, lowestFinalPrice: 135).displayPrice;
      expect(dp.price, 135);
      expect(dp.mrp, 150);
    });

    test('single-seller doc applies its own discount to its own price', () {
      final dp = _catalog(price: 200, maxDiscountPct: 10).displayPrice;
      expect(dp.price, 180);
      expect(dp.mrp, 200);
    });

    test('no discount anywhere is a plain price', () {
      final dp = _catalog(price: 200).displayPrice;
      expect(dp.price, 200);
      expect(dp.hasOffer, isFalse);
    });
  });
}
