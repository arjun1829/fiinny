import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/reel_model.dart';
import 'package:krishidukaan_app/features/reels/domain/ranking_context.dart';
import 'package:krishidukaan_app/features/reels/domain/reel_ranker.dart';

/// Old reels still on their raw upload are slow to start, so the feed ranks
/// them lower until the server compresses them. Same rule as the website's
/// app/reels/lib/ranking/rank.ts.
void main() {
  final now = DateTime(2026, 10, 10, 12);

  ReelModel reel(
    String id, {
    required bool optimized,
    int ageDays = 30,
    int views = 500,
  }) => ReelModel(
    id: id,
    shopOwnerId: 'shop-$id',
    shopName: 'Shop $id',
    videoUrl: 'https://x/$id',
    caption: '',
    likesCount: 50,
    commentsCount: 5,
    viewsCount: views,
    createdAt: now.subtract(Duration(days: ageDays)),
    optimized: optimized,
  );

  const ranker = ReelRanker();
  final ctx = RankingContext(now: now);

  test('a raw old reel scores lower than the same reel compressed', () {
    final raw = ranker.scoreOne(reel('a', optimized: false), ctx).score;
    final fast = ranker.scoreOne(reel('a', optimized: true), ctx).score;
    expect(raw, closeTo(fast * ReelRanker.uncompressedPenalty, 1e-9));
  });

  test('a new upload gets a day before it is treated as slow', () {
    final fresh = reel('n', optimized: false, ageDays: 0);
    expect(ReelRanker.isSlowToStart(fresh, now), isFalse);
    expect(
      ReelRanker.isSlowToStart(reel('o', optimized: false, ageDays: 2), now),
      isTrue,
    );
    expect(ReelRanker.isSlowToStart(reel('c', optimized: true), now), isFalse);
  });

  test('raw old reels go after compressed ones but are not removed', () {
    final list = [
      reel('raw1', optimized: false),
      reel('fast1', optimized: true),
      reel('raw2', optimized: false),
      reel('fast2', optimized: true),
    ];
    final ranked = ranker.rank(list, ctx).map((r) => r.id).toList();
    expect(ranked.length, 4);
    expect(ranked.take(2).toSet(), {'fast1', 'fast2'});
  });

  test('raw old reels are never picked for the exploration slot', () {
    final list = [
      for (var i = 0; i < 6; i++) reel('fast$i', optimized: true, ageDays: 2),
      reel('rawNew', optimized: false, ageDays: 3, views: 1),
    ];
    final ranked = ranker.rank(list, ctx).map((r) => r.id).toList();
    expect(ranked.last, 'rawNew');
  });
}
