import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/marketplace/screens/home_screen.dart';

/// Home shows two reel rails — "Latest Reels" up top and "More Reels" at the
/// bottom. They must never show the same reel, and the pick must change when
/// the shuffle seed is re-rolled by pull-to-refresh.
void main() {
  List<int> feed(int n) => List.generate(n, (i) => i);

  // The two rails as Home wires them up.
  List<int> top(List<int> f, int seed) => homeRailSlice(f, seed, 0);
  List<int> bottom(List<int> f, int seed) => homeRailSlice(f, seed, 4);

  group('home reel rails', () {
    test('the two rails never share a reel', () {
      for (var size = 1; size <= 50; size++) {
        for (final seed in [1, 7, 12345, 999999]) {
          final f = feed(size);
          final overlap =
              top(f, seed).toSet().intersection(bottom(f, seed).toSet());
          expect(overlap, isEmpty,
              reason: 'size $size seed $seed produced an overlap');
        }
      }
    });

    test('each rail shows at most 4, and only reels that exist', () {
      final f = feed(20);
      expect(top(f, 42).length, 4);
      expect(bottom(f, 42).length, 4);
      expect(f.toSet().containsAll(top(f, 42)), isTrue);
      expect(f.toSet().containsAll(bottom(f, 42)), isTrue);
    });

    test('a short feed fills the top rail first and never repeats it below',
        () {
      // 4 reels total: the top rail takes them all, the bottom gets nothing
      // rather than re-showing the same four (the old behaviour).
      final f = feed(4);
      expect(top(f, 3).length, 4);
      expect(bottom(f, 3), isEmpty);

      // 6 reels: bottom gets the 2 the top rail didn't take.
      final six = feed(6);
      expect(top(six, 3).length, 4);
      expect(bottom(six, 3).length, 2);
      expect(
        top(six, 3).toSet().intersection(bottom(six, 3).toSet()),
        isEmpty,
      );
    });

    test('the same seed is stable, a new seed re-rolls the pick', () {
      final f = feed(30);
      expect(top(f, 100), top(f, 100), reason: 'same seed must be stable');

      // Across many different seeds the top rail should not keep showing the
      // identical four reels — that was the original complaint.
      final picks = {
        for (final seed in List.generate(25, (i) => i * 7919))
          top(f, seed).join(',')
      };
      expect(picks.length, greaterThan(1),
          reason: 'refreshing should change which reels are shown');
    });
  });
}
