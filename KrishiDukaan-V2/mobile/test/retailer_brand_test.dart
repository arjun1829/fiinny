import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/retailer_brand_model.dart';
import 'package:krishidukaan_app/features/brand/widgets/brand_poster.dart';

void main() {
  group('RetailerBrandModel', () {
    test('parses defensively and keeps only https photos', () {
      final b = RetailerBrandModel.fromMap({
        'enabled': true,
        'tagline': '  Trusted since 1998 ',
        'photos': ['https://a/x.jpg', 'javascript:1', 5],
        'highlights': ['Home delivery', '', 3],
        'establishedYear': '19a98',
        'whatsapp': '+91 98-765',
        'socialLinks': {'instagram': '@ramagro'},
      });
      expect(b.enabled, isTrue);
      expect(b.tagline, 'Trusted since 1998');
      expect(b.photos, ['https://a/x.jpg']);
      expect(b.highlights, ['Home delivery']);
      expect(b.establishedYear, '1998');
      expect(b.whatsapp, '+9198765');
      expect(b.instagram, 'https://instagram.com/ramagro');
    });

    test('social links: handles, bare domains, http upgraded, bad rejected', () {
      expect(RetailerBrandModel.socialUrl('youtube', '@farmtv'),
          'https://youtube.com/@farmtv');
      expect(RetailerBrandModel.socialUrl('facebook', 'facebook.com/ram.agro'),
          'https://facebook.com/ram.agro');
      expect(RetailerBrandModel.socialUrl('instagram', 'http://instagram.com/x1'),
          'https://instagram.com/x1');
      expect(RetailerBrandModel.socialUrl('instagram', 'javascript:alert(1)'), '');
    });

    test('toMap writes only the keys the rules allow', () {
      final m = const RetailerBrandModel(enabled: true, instagram: '@ab')
          .toMap();
      expect(m.keys.toSet(), {
        'enabled',
        'tagline',
        'about',
        'establishedYear',
        'photos',
        'openingHours',
        'highlights',
        'whatsapp',
        'socialLinks',
      });
      expect(m['socialLinks'], {'instagram': 'https://instagram.com/ab'});
    });

    test('caps lists at the rule limits', () {
      final b = RetailerBrandModel.fromMap({
        'photos': List.generate(12, (i) => 'https://a/$i.jpg'),
        'highlights': List.generate(12, (i) => 'h$i'),
      });
      expect(b.photos.length, RetailerBrandModel.maxPhotos);
      expect(b.highlights.length, RetailerBrandModel.maxHighlights);
    });
  });

  testWidgets('poster lays out long content without overflow', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Center(
          child: BrandPoster(
            data: BrandPosterData(
              shopName:
                  'Shri Ramchandra Krishi Seva Kendra and Fertilizer Depot',
              tagline:
                  'Trusted seeds, fertilizers and crop protection for every farmer in the taluka since 1998',
              place: 'Baramati, Maharashtra',
              phone: '+919876543210',
              logoUrl: null,
              bannerUrl: null,
              photos: [],
              highlights: [
                'Home delivery',
                'Genuine products',
                'Expert crop advice',
                'Soil testing',
              ],
              link: 'krishidukan.com/shop/+919876543210',
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Order on the KrishiDukan app'), findsOneWidget);
  });
}
