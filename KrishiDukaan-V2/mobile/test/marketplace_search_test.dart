import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/catalog_model.dart';
import 'package:krishidukaan_app/features/marketplace/data/catalog_repository.dart';
import 'package:krishidukaan_app/features/marketplace/data/marketplace_search.dart';

/// A minimal marketplaceCards doc.
CatalogModel _card(String name,
        {String category = 'Fertilizers',
        String store = 'Kisan Agro',
        String description = '',
        List<String>? aliases}) =>
    CatalogModel.fromCard({
      'id': name,
      'name': name,
      'price': 100,
      'lowestPrice': 100,
      'category': category,
      'description': description,
      'store': store,
      'image': 'https://img/x.jpg',
      'searchAliases': ?aliases,
    });

List<String> _names(List<CatalogModel> ps) => ps.map((p) => p.name).toList();

void main() {
  group('phoneticKey', () {
    test('farmer spellings of one word share a key', () {
      expect(['power', 'powar', 'pawar', 'pavar'].map(phoneticKey).toSet(), {'pwr'});
      expect(['plus', 'plas', 'pals', 'ples', 'pulas'].map(phoneticKey).toSet(), {'pls'});
      expect(phoneticKey('sulphur'), phoneticKey('salphur'));
    });

    test('matches the website and server keys', () {
      // Same values app/lib/marketplace-cards.ts phoneticKey() returns.
      expect(phoneticKey('gramoxone'), 'grmxn');
      expect(phoneticKey('jeffa'), 'jf');
      expect(phoneticKey('booster'), 'bstr');
      expect(phoneticKey('करण'), '');
      expect(phoneticKey('2845'), '');
      expect(phoneticKey('a'), '');
    });
  });

  test('queryWords joins spaced letters and keeps order', () {
    expect(queryWords('d a p'), ['dap']);
    expect(queryWords('power plus booster'), ['power', 'plus', 'booster']);
    expect(queryWords('15 15 15'), ['15', '15', '15']);
  });

  group('searchProducts', () {
    final catalog = [
      _card('Adama 2,4-D', category: 'Herbicides', store: 'Karan Arjun Krushi Seva Kendra'),
      _card('Karan Arjun Root Booster', category: 'Bio-Stimulants'),
      _card('Karan Arjun Power Plus', category: 'Bio-Stimulants'),
      _card('DAP 50kg'),
      _card('Nano DAP'),
      _card('SSP Ziron Power Plus,ZMG'),
    ];

    test('extra word nobody has is dropped: power plus booster', () {
      final hits = _names(searchProducts(catalog, 'power plus booster'));
      expect(hits.first, 'Karan Arjun Power Plus');
      expect(hits, isNot(contains('Karan Arjun Root Booster')));
    });

    test('sound-alike spelling finds the product', () {
      expect(_names(searchProducts(catalog, 'pawar plas')), contains('Karan Arjun Power Plus'));
    });

    test('spaced letters', () {
      expect(_names(searchProducts(catalog, 'd a p')).first, 'DAP 50kg');
    });

    test('name match beats a shop-name match', () {
      final hits = _names(searchProducts(catalog, 'karan arjun'));
      expect(hits.indexOf('Karan Arjun Power Plus'), lessThan(hits.indexOf('Adama 2,4-D')));
    });

    test('a linked search finds its product first', () {
      final withAlias = [
        ...catalog.where((p) => p.name != 'Karan Arjun Power Plus'),
        _card('Karan Arjun Power Plus', category: 'Bio-Stimulants', aliases: ['power plus booster', 'करण अर्जुन पावर प्लस']),
      ];
      expect(_names(searchProducts(withAlias, 'power plus booster')).first, 'Karan Arjun Power Plus');
      expect(_names(searchProducts(withAlias, 'करण अर्जुन पावर प्लस')).first, 'Karan Arjun Power Plus');
    });

    test('nothing related still finds nothing', () {
      expect(searchProducts(catalog, 'tractor'), isEmpty);
    });

    test('filterProducts uses it, after the category filter', () {
      final hits = CatalogRepository.filterProducts(catalog, category: 'Fertilizers', searchQuery: 'dap');
      expect(_names(hits), ['DAP 50kg', 'Nano DAP']);
    });
  });
}
