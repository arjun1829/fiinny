import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/catalog_model.dart';

/// A marketplaceCards doc as functions/src/marketplace/cards.ts writes it.
Map<String, dynamic> _card() => {
      'id': 'canon-doc',
      'name': 'Urea 45kg',
      'fullName': 'Urea 45kg Neem Coated',
      'price': 300,
      'category': 'Fertilizers',
      'description': 'Nitrogen fertilizer',
      'image': 'https://img/urea.jpg',
      'stock': 'In Stock',
      'store': 'Kisan Agro',
      'source': 'manufacturer_inventory',
      'manufacturerPhone': '+919800000001',
      'sellMode': 'online_delivery',
      'isOnline': true,
      'gstApplicable': true,
      'gstRate': 5,
      'gstIncluded': false,
      'unit': '45kg',
      'averageRating': 4.5,
      'totalReviews': 2,
      'maxDiscountPct': 10,
      'effectiveDiscountPct': 10,
      'lowestPrice': 280,
      'lowestFinalPrice': 252,
      'sellerDiscounts': {'uid-ret1': 10, '+919811110001': 10, '9822200000': 5},
      'mergedProductIds': ['canon-doc', 'copy-a', 'copy-b'],
      'availability': [
        {
          'storeId': 'uid-ret1',
          'storePhone': '+919811110001',
          'storeName': 'Patil Krushi Kendra',
          'stockLevel': 'In Stock',
          'sellingPrice': 280,
          'isOnline': true,
          'discountPct': 10,
          'variants': [
            {'unit': '45kg', 'price': 280},
          ],
        },
        {
          'storeId': '',
          'storePhone': '+919800000001',
          'stockLevel': 'In Stock',
          'sellingPrice': 300,
        },
      ],
      'variants': [
        {'unit': '45kg', 'price': 300},
        {'unit': '50kg', 'price': 330},
      ],
      'sellerCount': 2,
      'createdAtMs': DateTime(2026, 9, 1).millisecondsSinceEpoch,
      'builtAt': Timestamp.fromDate(DateTime(2026, 10, 3)),
      'nameKey': 'urea 45kg',
      'categoryKey': 'fertilizers',
      'liveDiscountPct': 10,
      'memberIds': ['canon-doc', 'copy-a', 'copy-b', 'inactive-doc'],
      'contentHash': 'abc',
      'sourceReadTime': Timestamp.fromDate(DateTime(2026, 10, 3)),
    };

void main() {
  test('card maps onto the merged catalog model the app used to build', () {
    final p = CatalogModel.fromCard(_card());

    expect(p.id, 'canon-doc');
    expect(p.collectionPath, 'products');
    expect(p.name, 'Urea 45kg');
    expect(p.price, 280, reason: 'cards show the lowest seller price, like the old merge');
    expect(p.lowestPrice, 280);
    expect(p.rating, 4.5);
    expect(p.reviewCount, 2);
    expect(p.sellerCount, 2);
    expect(p.availability, hasLength(2));
    expect(p.availability!.first.storeName, 'Patil Krushi Kendra');
    expect(p.availability!.first.variants!.single.price, 280);
    expect(p.variants, hasLength(2));
    expect(p.unit, '45kg');
    expect(p.maxDiscountPct, 10);
    expect(p.gstApplicable, isTrue);
    expect(p.gstRate, 5);
    expect(p.gstIncluded, isFalse);
    expect(p.isOnline, isTrue);
    expect(p.sellMode, 'online_delivery');
    expect(p.mergedProductIds, ['canon-doc', 'copy-a', 'copy-b']);
    expect(p.createdAt, DateTime(2026, 9, 1));
    expect(p.updatedAt, DateTime(2026, 10, 3));
    expect(p.isActive, isTrue);
  });

  test('seller discounts are reachable by 10-digit and +91 phone', () {
    final d = CatalogModel.fromCard(_card()).sellerDiscounts;
    expect(d['uid-ret1'], 10);
    expect(d['9811110001'], 10);
    expect(d['+919811110001'], 10);
    expect(d['9822200000'], 5);
    expect(d['+919822200000'], 5);
  });

  test('a card without lowestPrice keeps its own price', () {
    final card = _card()..remove('lowestPrice');
    expect(CatalogModel.fromCard(card).price, 300);
  });

  test('discount falls back to the best seller discount when the card has none', () {
    final card = _card()
      ..['maxDiscountPct'] = 0
      ..['effectiveDiscountPct'] = 0;
    expect(CatalogModel.fromCard(card).maxDiscountPct, 10);
  });
}
