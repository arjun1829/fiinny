import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/data/paged_feed.dart';

/// Orders filed under two keys (sellerPhone and sellerId), some under both.
Future<List<String>> _seed(FakeFirebaseFirestore db) async {
  final base = DateTime(2026, 10, 1);
  final expected = <String, DateTime>{};
  for (var i = 0; i < 75; i++) {
    final at = base.subtract(Duration(minutes: i * 7));
    final data = <String, dynamic>{'createdAt': Timestamp.fromDate(at)};
    if (i % 3 != 2) data['sellerPhone'] = '+919000000001';
    if (i % 3 != 0) data['sellerId'] = 'uid1';
    await db.collection('orders').doc('o$i').set(data);
    expected['o$i'] = at;
  }
  await db.collection('orders').doc('other').set({
    'sellerPhone': '+919999999999',
    'createdAt': Timestamp.fromDate(base),
  });
  return expected.keys.toList()
    ..sort((a, b) => expected[b]!.compareTo(expected[a]!));
}

PagedFeed<String> _feed(FakeFirebaseFirestore db) => PagedFeed<String>(
      queries: [
        db.collection('orders').where('sellerPhone', isEqualTo: '+919000000001'),
        db.collection('orders').where('sellerId', isEqualTo: 'uid1'),
      ],
      map: (d) => d.id,
      pageSize: 10,
    );

void main() {
  test('first page is the newest docs in order, load more reaches all', () async {
    final db = FakeFirebaseFirestore();
    final expected = await _seed(db);
    final feed = _feed(db);
    final first = await feed.stream.first;
    expect(first, isNotEmpty);
    expect(first.length, lessThanOrEqualTo(20));
    expect(first, expected.sublist(0, first.length), reason: 'a prefix, no gaps');

    var list = first;
    var guard = 0;
    while (feed.hasMore && guard++ < 20) {
      await feed.loadMore();
      list = await feed.stream.first;
      expect(list, expected.sublist(0, list.length), reason: 'still a prefix');
    }
    expect(list, expected, reason: 'every doc once, newest first');
    feed.dispose();
  });

  test('a new order shows at the top and nothing drops out', () async {
    final db = FakeFirebaseFirestore();
    final expected = await _seed(db);
    final feed = _feed(db);
    final first = await feed.stream.first;

    await db.collection('orders').doc('new').set({
      'sellerPhone': '+919000000001',
      'createdAt': Timestamp.fromDate(DateTime(2026, 10, 2)),
    });
    final updated = await feed.stream.firstWhere((l) => l.first == 'new');
    // Everything shown before is still shown, after the new one.
    expect(updated.sublist(1, first.length + 1), first);

    var list = updated;
    var guard = 0;
    while (feed.hasMore && guard++ < 20) {
      await feed.loadMore();
      list = await feed.stream.first;
    }
    expect(list, ['new', ...expected]);
    feed.dispose();
  });
}
