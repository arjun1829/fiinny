import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/services/app_update_service.dart';

void main() {
  int cmp(String a, String b) => AppUpdateService.compareVersions(a, b);

  test('equal versions compare as 0', () {
    expect(cmp('2.4.0', '2.4.0'), 0);
    expect(cmp('2.4', '2.4.0'), 0); // missing segments treated as 0
  });

  test('older version compares less', () {
    expect(cmp('2.4.0', '2.5.0') < 0, isTrue);
    expect(cmp('2.4.0', '3.0.0') < 0, isTrue);
    expect(cmp('2.4.1', '2.4.2') < 0, isTrue);
  });

  test('newer version compares greater', () {
    expect(cmp('2.5.0', '2.4.0') > 0, isTrue);
    expect(cmp('3.0.0', '2.9.9') > 0, isTrue);
  });

  test('numeric (not lexicographic) segment ordering', () {
    // The classic bug: "2.10.0" must be NEWER than "2.9.0".
    expect(cmp('2.10.0', '2.9.0') > 0, isTrue);
    expect(cmp('2.9.0', '2.10.0') < 0, isTrue);
  });

  test('non-numeric suffixes do not throw and are ignored', () {
    expect(cmp('2.4.0-beta', '2.4.0'), 0);
    expect(cmp('2.4.0+117', '2.4.0'), 0);
    expect(() => cmp('', ''), returnsNormally);
  });
}
