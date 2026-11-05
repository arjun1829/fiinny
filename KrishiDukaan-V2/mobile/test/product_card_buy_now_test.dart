import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/catalog_model.dart';
import 'package:krishidukaan_app/core/models/listing_model.dart'
    show VariantModel;
import 'package:krishidukaan_app/core/widgets/product_card.dart';
import 'package:krishidukaan_app/features/marketplace/data/quick_buy.dart';

CatalogModel _product({
  List<VariantModel>? variants,
  String? sellMode,
  bool? isOnline,
}) => CatalogModel(
  id: 'p1',
  name: 'Power Plus Booster',
  nameSearch: const ['power', 'plus', 'booster'],
  category: 'Fertilizers',
  images: const [],
  price: 450,
  sellerCount: 1,
  variants: variants,
  sellMode: sellMode,
  isOnline: isOnline,
);

Future<void> _pump(
  WidgetTester t,
  ProductCard card, {
  double w = 105,
  double h = 210,
}) => t.pumpWidget(
  MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(width: w, height: h, child: card),
      ),
    ),
  ),
);

void main() {
  testWidgets(
    'Market-sized card shows Buy Now without overflowing, and the tap runs',
    (t) async {
      var taps = 0;
      await _pump(
        t,
        ProductCard(
          product: _product(),
          onTap: () {},
          onBuyNow: () async => taps++,
        ),
      );
      expect(find.text('Buy Now'), findsOneWidget);
      expect(
        t.takeException(),
        isNull,
      ); // no RenderFlex overflow at the 3-column size
      await t.tap(find.text('Buy Now'));
      await t.pump();
      expect(taps, 1);
    },
  );

  testWidgets('Home-sized card (160 x 250) also fits', (t) async {
    await _pump(
      t,
      ProductCard(product: _product(), onTap: () {}, onBuyNow: () async {}),
      w: 160,
      h: 250,
    );
    expect(find.text('Buy Now'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('no button unless a Buy Now action is supplied', (t) async {
    await _pump(t, ProductCard(product: _product(), onTap: () {}));
    expect(find.text('Buy Now'), findsNothing);
  });

  testWidgets('a multi-size product is labelled Choose size', (t) async {
    await _pump(
      t,
      ProductCard(
        product: _product(),
        onTap: () {},
        onBuyNow: () async {},
        buyNowLabel: 'Choose size',
      ),
    );
    expect(find.text('Choose size'), findsOneWidget);
  });

  test('canQuickBuy / needsSizeChoice follow the product', () {
    expect(canQuickBuy(_product()), isTrue);
    expect(canQuickBuy(_product(sellMode: 'offline_store_only')), isFalse);
    expect(canQuickBuy(_product(isOnline: false)), isFalse);
    final one = <VariantModel>[
      const VariantModel(label: '1L', price: 450, stock: null),
    ];
    final two = <VariantModel>[
      ...one,
      const VariantModel(label: '5L', price: 2000, stock: null),
    ];
    expect(needsSizeChoice(_product(variants: one)), isFalse);
    expect(needsSizeChoice(_product(variants: two)), isTrue);
  });
}
