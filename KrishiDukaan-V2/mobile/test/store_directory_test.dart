import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/marketplace/data/store_repository.dart';

/// storeDirectory chunk docs as functions/src/stores/directory.ts writes them.
List<Map<String, dynamic>> _chunks() => [
      {
        'buildId': 'b1',
        'chunkIndex': 1,
        'chunkCount': 2,
        'entries': [
          {'c': 'stores', 'id': 'legacy1', 'd': {'name': 'Old Store'}},
          {
            'c': 'profiles',
            'id': '+919811110001',
            'd': {'role': 'retailer', 'shopName': 'Patil Krushi Kendra'},
          },
        ],
      },
      {
        'buildId': 'b1',
        'chunkIndex': 0,
        'chunkCount': 2,
        'entries': [
          {
            'c': 'retailers',
            'id': '+919811110001',
            'd': {
              'shopName': 'Patil Krushi Kendra',
              'geo': const GeoPoint(18.52, 73.85),
              'address': {'city': 'Pune'},
            },
          },
          {
            'c': 'manufacturers',
            'id': '+919800000001',
            'd': {'businessName': 'Kisan Agro', 'slug': 'kisan-agro'},
          },
        ],
        'ratings': {
          '+919811110001': {'sum': 9, 'count': 2},
        },
      },
    ];

void main() {
  test('chunks reassemble into per-collection records and ratings', () {
    final dir = parseStoreDirectory(_chunks());

    expect(dir.recordsOf('retailers').single.id, '+919811110001');
    final retailer = dir.recordsOf('retailers').single.data();
    expect(retailer['geo'], isA<GeoPoint>());
    expect((retailer['address'] as Map)['city'], 'Pune');
    expect(dir.recordsOf('manufacturers').single.data()['slug'], 'kisan-agro');
    expect(dir.recordsOf('profiles').single.data()['role'], 'retailer');
    expect(dir.recordsOf('stores').single.id, 'legacy1');
    expect(dir.ratings['+919811110001']?.sum, 9);
    expect(dir.ratings['+919811110001']?.count, 2);
  });

  test('records keep the order the directory stored them in', () {
    final chunks = _chunks();
    (chunks[1]['entries'] as List).add({
      'c': 'retailers',
      'id': '+919811110002',
      'd': {'shopName': 'Second'},
    });
    final ids = parseStoreDirectory(chunks).recordsOf('retailers').map((r) => r.id);
    expect(ids, ['+919811110001', '+919811110002']);
  });

  test('a missing or unbuilt directory is an error, not zero stores', () {
    expect(() => parseStoreDirectory([]), throwsStateError);
    expect(() => parseStoreDirectory([_chunks().first]), throwsStateError);
    final mixed = _chunks()..first['buildId'] = 'b2';
    expect(() => parseStoreDirectory(mixed), throwsStateError);
  });
}
