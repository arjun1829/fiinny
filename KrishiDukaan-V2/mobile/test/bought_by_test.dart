import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/widgets/bought_by.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('parses the stats doc; nothing to show without `show`', () {
    final s = BuyStats.fromMap({
      'show': {'count': 312, 'label': '300+', 'days': 60},
      'recent': [
        {'i': 'R', 'c': 0},
        {'i': 'स', 'c': 3},
        {'i': '', 'c': 9},
      ],
    })!;
    expect(s.label, '300+');
    expect(s.days, 60);
    expect(s.recent.map((r) => r.initial), ['R', 'स', '']);
    expect(BuyStats.fromMap({'show': null, 'd90': 2}), isNull);
    expect(BuyStats.fromMap(null), isNull);
  });

  Widget host(BuyStats? stats) => ProviderScope(
        overrides: [buyStatsProvider.overrideWith((ref, id) async => stats)],
        child: const MaterialApp(
          home: Scaffold(
            body: Padding(
              padding: EdgeInsets.all(16),
              child: BoughtBy(productId: 'p1'),
            ),
          ),
        ),
      );

  testWidgets('shows avatars and the count line', (tester) async {
    await tester.pumpWidget(host(BuyStats.fromMap({
      'show': {'count': 312, 'label': '300+', 'days': 60},
      'recent': [
        {'i': 'R', 'c': 0},
        {'i': 'S', 'c': 1},
        {'i': 'A', 'c': 2},
        {'i': 'M', 'c': 3},
      ],
    })));
    await tester.pumpAndSettle();
    expect(find.text('R'), findsOneWidget);
    expect(find.textContaining('300+ people bought this', findRichText: true),
        findsOneWidget);
    expect(find.textContaining('in the last 2 months', findRichText: true),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('takes no space when there is nothing to show', (tester) async {
    await tester.pumpWidget(host(null));
    await tester.pumpAndSettle();
    expect(find.textContaining('bought', findRichText: true), findsNothing);
  });
}
