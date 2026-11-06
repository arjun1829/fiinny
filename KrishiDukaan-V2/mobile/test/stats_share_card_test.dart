import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/dashboard/widgets/stats_share_card.dart';

const _data = StatsShareData(
  shopName: 'Shree Ganesh Krishi Seva Kendra and Fertilizer Depot',
  periodLabel: 'Last 7 days',
  link: 'krishidukan.com/shop/+919876543210',
  orders: 48,
  revenue: 184500,
  productViews: 12450,
  calls: 0,
  followers: 1210,
  reelViews: 256000,
  bestSeller: 'Urea 45kg (IFFCO) premium neem coated fertiliser bag',
  trend: [3, 8, 0, 12, 6, 9, 5],
);

final _defaults = {
  for (final m in StatsShareMetric.values)
    if (m.onByDefault) m,
};

void main() {
  test('compact numbers in Indian units', () {
    expect(compactNumber(0), '0');
    expect(compactNumber(7), '7');
    expect(compactNumber(1210), '1,210');
    expect(compactNumber(12460), '12.5K');
    expect(compactNumber(184500), '1.8L');
    expect(compactNumber(11000000), '1.1Cr');
    expect(compactNumber(-5), '0');
  });

  test('sales hidden by default; zero tiles left out', () {
    final tiles = statTiles(_data, _defaults);
    expect(tiles.map((t) => t.label), ['Orders', 'Product views', 'Followers', 'Reel views']);
    final withSales = statTiles(_data, {..._defaults, StatsShareMetric.revenue});
    expect(withSales[1], (label: 'Sales', value: '₹1.8L'));
  });

  test('nothing to show off: orders still shown', () {
    const empty = StatsShareData(
        shopName: 'A', periodLabel: 'Last 7 days', orders: 0, revenue: 0,
        productViews: 0, calls: 0, followers: 0, reelViews: 0);
    expect(statTiles(empty, _defaults).map((t) => t.label), ['Orders']);
  });

  testWidgets('card lays out without overflow in every combination', (tester) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final combos = <Set<StatsShareMetric>>[
      {...StatsShareMetric.values},
      _defaults,
      {StatsShareMetric.orders},
      {StatsShareMetric.orders, StatsShareMetric.trend},
      {StatsShareMetric.revenue, StatsShareMetric.bestSeller, StatsShareMetric.link},
    ];
    for (final show in combos) {
      await tester.pumpWidget(MaterialApp(
        home: Center(child: StatsShareCard(data: _data, show: show)),
      ));
      expect(tester.takeException(), isNull, reason: '$show');
      expect(tester.getSize(find.byType(StatsShareCard)), const Size(360, 640));
    }
  });
}
