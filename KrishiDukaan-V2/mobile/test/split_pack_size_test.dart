import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/utils/weight_utils.dart';

void main() {
  test('litres and ml keep their unit (were shown as KG)', () {
    expect(splitPackSize('1L'), (size: '1', unit: 'L'));
    expect(splitPackSize('1 Ltr'), (size: '1', unit: 'L'));
    expect(splitPackSize('500 ml'), (size: '500', unit: 'ml'));
    expect(splitPackSize('500ML'), (size: '500', unit: 'ml'));
  });

  test('weights map to the form chips', () {
    expect(splitPackSize('1 KG'), (size: '1', unit: 'KG'));
    expect(splitPackSize('2.5kg'), (size: '2.5', unit: 'KG'));
    expect(splitPackSize('250 gm'), (size: '250', unit: 'gm'));
  });

  test('count units and unknown labels', () {
    expect(splitPackSize('1 Packet'), (size: '1', unit: 'Packet'));
    expect(splitPackSize('2 bottles'), (size: '2', unit: 'Bottle'));
    expect(splitPackSize('Family pack'), isNull);
    expect(splitPackSize(null), isNull);
  });
}
