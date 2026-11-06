import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/constants/app_config.dart';
import 'package:krishidukaan_app/core/utils/web_links.dart';

void main() {
  final base = AppConfig.apiBaseUrl;

  test('shop and brand links use +91 and 10 digits whatever the stored form', () {
    for (final p in ['+919876543210', '9876543210', '919876543210', '+91 98765-43210']) {
      expect(WebLinks.shop(p), '$base/shop/+919876543210');
      expect(WebLinks.brand(p), '$base/brand/+919876543210');
    }
  });

  test('no link for an id that is not a phone (e.g. an Auth UID)', () {
    for (final v in ['', 'abcDEF1234567890xyz', '12345', 'ramesh-agro']) {
      expect(WebLinks.shop(v), isNull);
      expect(WebLinks.brand(v), isNull);
    }
  });
}
