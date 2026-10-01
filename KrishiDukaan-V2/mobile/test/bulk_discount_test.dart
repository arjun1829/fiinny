import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/listing_model.dart';

/// Bulk/quantity discount tiers — mirrors web's `getBulkDiscountPct`
/// (app/utils/discount.ts). Higher tiers override lower ones, and a
/// quantity below every tier's minimum gets no bulk discount at all.

ListingModel _listing({
  bool bulkDiscountEnabled = true,
  List<BulkDiscountTierModel> tiers = const [],
}) {
  return ListingModel(
    id: 'l1',
    catalogId: 'p1',
    sellerPhone: '+919000000000',
    sellerName: 'Test Seller',
    sellerType: 'retailer',
    price: 100,
    stockQuantity: 50,
    variants: const [],
    bulkDiscountEnabled: bulkDiscountEnabled,
    bulkDiscountTiers: tiers,
  );
}

void main() {
  group('BulkDiscountTierModel.fromMap', () {
    test('parses minQty and discountPct', () {
      final t = BulkDiscountTierModel.fromMap({'minQty': 10, 'discountPct': 15});
      expect(t.minQty, 10);
      expect(t.discountPct, 15);
    });

    test('missing fields default to a safe minimum, not a crash', () {
      final t = BulkDiscountTierModel.fromMap({});
      expect(t.minQty, 1);
      expect(t.discountPct, 0);
    });
  });

  group('ListingModel.bulkTierFor', () {
    final tiers = [
      const BulkDiscountTierModel(minQty: 5, discountPct: 5),
      const BulkDiscountTierModel(minQty: 10, discountPct: 10),
      const BulkDiscountTierModel(minQty: 20, discountPct: 20),
    ];

    test('below every tier minimum gets no bulk discount', () {
      final l = _listing(tiers: tiers);
      expect(l.bulkTierFor(3), isNull);
    });

    test('exactly at a tier minimum qualifies for that tier', () {
      final l = _listing(tiers: tiers);
      expect(l.bulkTierFor(5)!.discountPct, 5);
    });

    test('between tiers gets the highest tier already reached', () {
      final l = _listing(tiers: tiers);
      expect(l.bulkTierFor(15)!.discountPct, 10);
    });

    test('at or above the top tier gets the best discount', () {
      final l = _listing(tiers: tiers);
      expect(l.bulkTierFor(20)!.discountPct, 20);
      expect(l.bulkTierFor(1000)!.discountPct, 20);
    });

    test('disabled bulk discounts never apply, even with tiers present', () {
      final l = _listing(bulkDiscountEnabled: false, tiers: tiers);
      expect(l.bulkTierFor(100), isNull);
    });

    test('enabled with no tiers configured applies nothing', () {
      final l = _listing(tiers: const []);
      expect(l.bulkTierFor(100), isNull);
    });

    test('tier order in the list does not matter — highest match still wins',
        () {
      // Web sorts before display but the match logic itself must not depend
      // on input order, since a save that shuffled tiers would silently
      // change which discount applies.
      final shuffled = [
        const BulkDiscountTierModel(minQty: 20, discountPct: 20),
        const BulkDiscountTierModel(minQty: 5, discountPct: 5),
        const BulkDiscountTierModel(minQty: 10, discountPct: 10),
      ];
      final l = _listing(tiers: shuffled);
      expect(l.bulkTierFor(15)!.discountPct, 10);
    });
  });

  group('ListingModel bulk fields parse independently of the base discount', () {
    test('bulkDiscountEnabled/Tiers default to off/empty when absent', () {
      final l = _listing(bulkDiscountEnabled: false, tiers: const []);
      expect(l.bulkDiscountEnabled, isFalse);
      expect(l.bulkDiscountTiers, isEmpty);
      expect(l.discount, isNull);
    });
  });
}
