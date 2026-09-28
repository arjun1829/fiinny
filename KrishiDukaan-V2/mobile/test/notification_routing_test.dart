import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/services/notification_service.dart';

/// Every notification type the backend emits must resolve to a real in-app
/// route — that is the whole point of the deep-link table. A type added to
/// functions/src/notifications/ without a case here silently produces a
/// notification that does nothing when tapped.
void main() {
  group('routeForNotification', () {
    test('order types', () {
      expect(routeForNotification('order', {}), '/dashboard/orders');
      expect(routeForNotification('order_update', {'orderId': 'o1'}), '/orders/o1');
      // Missing id still lands somewhere useful rather than nowhere.
      expect(routeForNotification('order_update', {}), '/orders');
    });

    test('order offer opens the Requests tab', () {
      // Sent by functions/src/notifications/reassignment.ts when another
      // seller rejects an order this seller could fulfil.
      expect(routeForNotification('order_offer', {'orderId': 'o1'}),
          '/dashboard/orders?tab=requests');
    });

    test('abandoned-checkout enquiry opens the seller enquiry list', () {
      // Must stay in step with web's /dashboard/enquiry — the WhatsApp
      // template for the same event links there, so the two platforms have to
      // agree on the path.
      expect(routeForNotification('enquiry', {'enquiryId': 'e1'}),
          '/dashboard/enquiry?id=e1');
      expect(routeForNotification('enquiry', {}), '/dashboard/enquiry');
    });

    test('inventory and low stock open the product for editing', () {
      expect(
        routeForNotification('inventory_added', {'productId': 'p1'}),
        '/dashboard/inventory?product=p1',
      );
      expect(
        routeForNotification('low_stock', {'productId': 'p1', 'stock': '2'}),
        '/dashboard/inventory?product=p1',
      );
      expect(routeForNotification('low_stock', {}), '/dashboard/inventory');
    });

    test('product ids are encoded, not concatenated raw', () {
      expect(
        routeForNotification('low_stock', {'productId': 'a/b c'}),
        '/dashboard/inventory?product=a%2Fb%20c',
      );
    });

    test('analytics digest carries its period through', () {
      expect(
        routeForNotification('analytics_digest', {'period': 'month'}),
        '/dashboard/analytics?period=month',
      );
      // The backend always sends one, but a malformed doc defaults to week.
      expect(
        routeForNotification('analytics_digest', {}),
        '/dashboard/analytics?period=week',
      );
    });

    test('reel engagement opens the reel', () {
      for (final type in ['reel_like', 'reel_comment', 'reel_comment_tag', 'reel_repost']) {
        expect(routeForNotification(type, {'reelId': 'r1'}), '/reel/r1',
            reason: '$type should deep-link to the reel');
      }
      expect(routeForNotification('reel_like', {}), '/reels');
    });

    test('a new follower opens the followers list', () {
      expect(routeForNotification('reel_follow', {'followerPhone': '+919000000000'}),
          '/followers');
    });

    test('grouped engagement opens its group', () {
      expect(
        routeForNotification('engagement_group', {'groupId': 'g1'}),
        '/activity/g1',
      );
      // Without a group there is nothing to show; fall back to the inbox.
      expect(routeForNotification('engagement_group', {}), '/notifications');
    });

    test('profile reminder opens the editor with highlighting on', () {
      expect(
        routeForNotification('profile_incomplete', {'missing': 'business name|pincode'}),
        '/profile/edit?highlight=business%20name%7Cpincode',
      );
      expect(
        routeForNotification('profile_incomplete', {}),
        '/profile/edit?highlight=1',
      );
    });

    test('subscription expiry preselects the existing plan', () {
      final route = routeForNotification(
        'subscription_expiry',
        {'subscriptionId': 's1', 'daysLeft': '3', 'seats': '5', 'months': '12'},
      );
      final uri = Uri.parse(route!);
      expect(uri.path, '/subscription');
      expect(uri.queryParameters['reason'], 'renewal');
      expect(uri.queryParameters['seats'], '5');
      expect(uri.queryParameters['months'], '12');
    });

    test('unknown types resolve to null rather than a bogus route', () {
      expect(routeForNotification('something_new', {}), isNull);
      expect(routeForNotification(null, {}), isNull);
    });

    test('empty-string data values are treated as absent', () {
      // Firestore docs written by older triggers carry '' rather than a
      // missing key; '' must not produce '/reel/'.
      expect(routeForNotification('reel_like', {'reelId': ''}), '/reels');
      expect(routeForNotification('low_stock', {'productId': '  '}),
          '/dashboard/inventory');
    });
  });
}
