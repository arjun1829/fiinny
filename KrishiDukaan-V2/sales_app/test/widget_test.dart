import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_sales/core/utils/date_range.dart';
import 'package:krishidukaan_sales/core/utils/ist_date.dart';

void main() {
  group('IstDate', () {
    test('key() renders an IST calendar day, not a UTC one', () {
      // 18:45 UTC on 14 Jul is already 00:15 IST on 15 Jul. Using the UTC day
      // here would file the visit against the wrong working day.
      final lateEvening = DateTime.utc(2026, 7, 14, 18, 45);
      expect(IstDate.key(lateEvening), '2026-07-15');
    });

    test('startOfDayUtc is 18:30 UTC the previous day', () {
      expect(
        IstDate.startOfDayUtc('2026-07-15'),
        DateTime.utc(2026, 7, 14, 18, 30),
      );
    });

    test('endOfDayUtc is exactly 24h after the start', () {
      expect(
        IstDate.endOfDayUtc(
          '2026-07-15',
        ).difference(IstDate.startOfDayUtc('2026-07-15')).inHours,
        24,
      );
    });

    test('shift crosses month boundaries', () {
      expect(IstDate.shift('2026-03-01', -1), '2026-02-28');
      expect(IstDate.shift('2026-12-31', 1), '2027-01-01');
    });

    test('monthStart pins to the first of the month', () {
      expect(IstDate.monthStart('2026-07-15'), '2026-07-01');
    });
  });

  group('RangePreset', () {
    test('thisWeek starts on Monday and ends today', () {
      final (from, to) = RangePreset.thisWeek.resolve();
      expect(to, IstDate.today());
      expect(IstDate.parse(from).weekday, DateTime.monday);
      expect(from.compareTo(to) <= 0, isTrue);
    });

    test('last30 spans 30 inclusive days', () {
      final (from, to) = RangePreset.last30.resolve();
      expect(IstDate.parse(to).difference(IstDate.parse(from)).inDays, 29);
    });
  });
}
