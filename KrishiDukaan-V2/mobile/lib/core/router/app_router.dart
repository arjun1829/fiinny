import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../providers/user_provider.dart';
import '../widgets/app_shell.dart';
import '../../features/auth/screens/phone_entry_screen.dart';
import '../../features/auth/screens/otp_verification_screen.dart';
import '../../features/auth/screens/onboarding_screen.dart';
import '../../features/marketplace/screens/home_screen.dart';
import '../../features/marketplace/screens/marketplace_screen.dart';
import '../../features/marketplace/screens/product_detail_screen.dart';
import '../../features/marketplace/screens/store_locator_screen.dart';
import '../models/store_model.dart';
import '../../features/cart/screens/cart_screen.dart';
import '../../features/cart/screens/checkout_screen.dart';
import '../../features/orders/screens/customer_orders_screen.dart';
import '../../features/orders/screens/invoice_screen.dart';
import '../../features/orders/screens/order_detail_screen.dart';
import '../../features/hubs/screens/hubs_screen.dart';
import '../../features/hubs/screens/hub_detail_screen.dart';
import '../../features/brand/screens/brand_screen.dart';
import '../../features/dashboard/screens/inventory_screen.dart';
import '../../features/dashboard/screens/seller_orders_screen.dart';
import '../../features/dashboard/screens/subscription_dashboard_screen.dart';
import '../../features/dashboard/screens/payouts_screen.dart';
import '../../features/dashboard/screens/delivery_settings_screen.dart';
import '../../features/dashboard/screens/subscription_screen.dart';
import '../../features/dashboard/screens/dashboard_profile_screen.dart';
import '../../features/dashboard/screens/dashboard_analytics_screen.dart';
import '../../features/dashboard/screens/dashboard_reviews_screen.dart';
import '../../features/enquiries/screens/enquiry_screen.dart';
import '../../features/dashboard/screens/dashboard_reels_screen.dart';
import '../../features/manufacturer/screens/manufacturer_dashboard_screen.dart';
import '../../features/manufacturer/screens/retailer_network_screen.dart';
import '../../features/manufacturer/screens/manufacturer_catalog_screen.dart';
import '../../features/manufacturer/screens/assign_product_screen.dart';
import '../../features/manufacturer/screens/brand_editor_screen.dart';
import '../../features/profile/screens/about_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/profile/screens/profile_edit_screen.dart';
import '../../features/profile/screens/settings_screen.dart';
import '../../features/notifications/notifications.dart';
import '../../features/notifications/engagement_group_screen.dart';
import '../../features/support/screens/support_screen.dart';
import '../../features/welcome/screens/splash_screen.dart';
import '../../features/welcome/screens/welcome_screen.dart';
import '../../features/reels/screens/reels_feed_screen.dart';
import '../../features/reels/screens/reel_deep_link_screen.dart';
import '../../features/reels/screens/reel_upload_screen.dart';
import '../../features/reels/screens/shop_products_screen.dart';
import '../../features/reels/screens/shop_profile_screen.dart';
import '../../features/reels/screens/followers_screen.dart';
import '../../features/reels/providers/reels_provider.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Wraps full-screen (outside-shell) pages so the Android system back button
/// never closes the app from a page with an empty stack. `context.go()` to a
/// top-level route (Buy Now → /checkout, the post-login redirect, deep links)
/// REPLACES the whole stack, leaving nothing beneath — a bare back press
/// would exit the app. If the router can pop we let it; otherwise back lands
/// on Home.
class _RootBackFallback extends StatelessWidget {
  final Widget child;
  const _RootBackFallback({required this.child});

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.of(context);
    return PopScope(
      canPop: router.canPop(),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) router.go('/');
      },
      child: child,
    );
  }
}
final _homeKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _marketKey = GlobalKey<NavigatorState>(debugLabel: 'market');
final _hubsKey = GlobalKey<NavigatorState>(debugLabel: 'hubs');
final _storesKey = GlobalKey<NavigatorState>(debugLabel: 'stores');
final _reelsKey = GlobalKey<NavigatorState>(debugLabel: 'reels');

// ── Shared web link → in-app route translation ─────────────────────────────
// The web and the app deliberately use different URL shapes for the same
// content (WebLinks.product/.reel in web_links.dart) — the web needs SEO- and
// SPA-friendly paths, the app needs its own go_router path table. Whenever an
// https://krishidukan.com/... link is opened with the app installed (Android
// App Links / iOS Universal Links hand it straight to the app instead of a
// browser), this maps it onto the matching internal route so it opens the
// actual product/reel screen instead of falling through to a 404.
//
// If the app is NOT installed, the OS never invokes this at all — the link
// opens in the browser and the website serves it normally. That split is
// exactly what App Links / Universal Links verification gives for free; nothing
// else in this app decides "web vs app", the OS does.
const _webHosts = {
  'krishidukan.com',
  'www.krishidukan.com',
  'karan-arjun-uat.web.app',
};

/// Returns the trailing `-{id}` segment of a `{kebab-name}-{id}` slug (the
/// convention shared by buildProductSlug/buildReelSlug on the web — see
/// web_links.dart). Falls back to the whole segment if there's no dash, so a
/// bare id still works.
String? _trailingSlugId(String slug) {
  if (slug.isEmpty) return null;
  final idx = slug.lastIndexOf('-');
  if (idx == -1) return slug;
  final id = slug.substring(idx + 1);
  return id.isEmpty ? null : id;
}

/// Translates an external https://krishidukan.com/... URI into an internal
/// route path, or returns null when [uri] isn't one of our web links (i.e.
/// every normal internal `context.go('/product/x')` call, whose relative URI
/// has no host at all).
String? _translateExternalLink(Uri uri) {
  if (uri.host.isEmpty || !_webHosts.contains(uri.host)) return null;

  final segments = uri.pathSegments;

  // Product share link: WebLinks.product → /?view=product&product={id}
  if (uri.queryParameters['view'] == 'product') {
    final id = uri.queryParameters['product'];
    if (id != null && id.isNotEmpty) return '/product/$id';
  }

  // Reel share link: WebLinks.reel → /reels/{slug}-{id}
  if (segments.length == 2 && segments[0] == 'reels') {
    final id = _trailingSlugId(segments[1]);
    if (id != null) return '/reel/$id';
  }

  // SEO product page (indexed by Google, not shared directly by the app):
  // /products/{slug}-{id}
  if (segments.length == 2 && segments[0] == 'products') {
    final id = _trailingSlugId(segments[1]);
    if (id != null) return '/product/$id';
  }

  // Manufacturer invite link: WebLinks.invite → /?inviteCode={code}
  final invite = uri.queryParameters['inviteCode'];
  if (invite != null && invite.isNotEmpty) {
    return '/login?inviteCode=${Uri.encodeComponent(invite)}';
  }

  // NOTE: brand links (web path /brand/{slug}) are deliberately NOT mapped
  // here — the app's /brand/:phone route needs a phone number, but the web
  // slug is name-based and only resolves to a phone via an async Firestore
  // query. There's also no in-app "share brand" action yet to produce these
  // links. Add slug resolution here if/when that's built.

  // Bare domain (e.g. the app icon's own web link, or an unrecognised path
  // under a known host) → land on Home rather than erroring.
  if (segments.isEmpty) return '/';

  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = _RouterRefreshNotifier(ref);
  ref.onDispose(notifier.dispose);

  return GoRouter(
    navigatorKey: _rootKey,
    refreshListenable: notifier,
    initialLocation: '/splash',
    observers: [
      ReelsNavigatorObserver(ref),
    ],
    redirect: (context, state) {
      // ── Shared web links (App Links / Universal Links) ─────────────────
      // A tap on a krishidukan.com link the OS handed straight to the app
      // (see AndroidManifest.xml intent-filter + iOS Associated Domains)
      // arrives here as a full https://... URI, not one of our internal
      // route paths — translate it BEFORE any other logic runs so it lands
      // on the matching in-app screen instead of 404ing.
      final external = _translateExternalLink(state.uri);
      if (external != null) return external;

      final path = state.matchedLocation;

      // Splash and first-install welcome run before any auth decisions.
      if (path == '/splash' || path == '/welcome') return null;

      // "Create account" is merged into the single sign-in flow. Redirect any
      // old /signup links (e.g. manufacturer invite links) into /login, keeping
      // the invite code so the new user still lands on the right onboarding.
      if (path == '/signup') {
        final invite = state.uri.queryParameters['inviteCode'];
        return (invite != null && invite.isNotEmpty)
            ? '/login?inviteCode=${Uri.encodeComponent(invite)}'
            : '/login';
      }

      final authState = ref.read(authStateProvider);
      if (authState.isLoading) return null;

      final user = authState.value;
      final isLoggedIn = user != null;

      final isAuthPath =
          path == '/login' || path == '/login/otp' || path == '/onboarding';

      const protectedPaths = ['/checkout', '/orders', '/dashboard'];
      final needsAuth = protectedPaths.any((p) => path.startsWith(p));

      if (!isLoggedIn && needsAuth) {
        return '/login?redirect=${Uri.encodeComponent(path)}';
      }

      if (isLoggedIn && isAuthPath) {
        final currentUser = ref.read(currentUserProvider).value;
        // Keep the post-login destination (?redirect=/checkout etc.) alive
        // across every hop of the auth flow: login → OTP → onboarding → there.
        final pendingRedirect = state.uri.queryParameters['redirect'];
        if (currentUser == null && path != '/onboarding') {
          final invite = state.uri.queryParameters['inviteCode'];
          final params = <String>[
            if (pendingRedirect != null && pendingRedirect.isNotEmpty)
              'redirect=${Uri.encodeComponent(pendingRedirect)}',
            if (invite != null && invite.isNotEmpty)
              'inviteCode=${Uri.encodeComponent(invite)}',
          ];
          return params.isEmpty
              ? '/onboarding'
              : '/onboarding?${params.join('&')}';
        }
        if (currentUser != null) {
          return (pendingRedirect != null && pendingRedirect.isNotEmpty)
              ? pendingRedirect
              : '/';
        }
      }

      // "/dashboard" itself is now just an alias for the seller's Overview,
      // which lives on Profile — Profile already renders the same read-only
      // overview/nav-hub content (and its own paywall-free access for unpaid
      // sellers), so having a second, different "Overview" screen reachable
      // both from the Profile tab and from this URL was confusing users who
      // saw two different pages for what the sidebar calls one destination.
      // Sub-routes (/dashboard/analytics, /dashboard/orders, etc.) are real,
      // distinct screens and keep the paywall gate below untouched.
      if (path == '/dashboard') return '/profile';

      if (isLoggedIn && path.startsWith('/dashboard')) {
        final canAccess = ref.read(canAccessDashboardProvider);
        if (!canAccess) return '/subscription?reason=paywall';
      }

      if (isLoggedIn && path.startsWith('/dashboard/manufacturer')) {
        if (!ref.read(isManufacturerProvider)) return '/profile';
      }

      return null;
    },
    routes: [
      // ── Launch (outside shell) ────────────────────────────────────────
      GoRoute(
        path: '/splash',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const SplashScreen(),
      ),
      GoRoute(
        path: '/welcome',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const WelcomeScreen(),
      ),

      // ── Auth (outside shell) ──────────────────────────────────────────
      GoRoute(
        path: '/login',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: PhoneEntryScreen(
            redirectAfterLogin: state.uri.queryParameters['redirect'],
            inviteCode: state.uri.queryParameters['inviteCode'],
          ),
        ),
        routes: [
          GoRoute(
            path: 'otp',
            builder: (_, state) {
              final extra = state.extra as Map<String, dynamic>?;
              return OtpVerificationScreen(
                phone: extra?['phone'] as String? ?? '',
                verificationId: extra?['verificationId'] as String? ?? '',
                redirectAfterLogin: extra?['redirect'] as String?,
                isSignup: extra?['isSignup'] as bool? ?? false,
                signupName: extra?['signupName'] as String?,
                signupRole: extra?['signupRole'] as String?,
                inviteCode: extra?['inviteCode'] as String?,
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: '/onboarding',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => OnboardingScreen(
          inviteCode: state.uri.queryParameters['inviteCode'],
          redirect: state.uri.queryParameters['redirect'],
        ),
      ),

      // ── Full-screen routes (outside shell) ───────────────────────────
      GoRoute(
        path: '/product/:catalogId',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: ProductDetailScreen(
            catalogId: state.pathParameters['catalogId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/cart',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: CartScreen()),
      ),
      GoRoute(
        path: '/checkout',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: CheckoutScreen()),
      ),
      GoRoute(
        path: '/orders',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: CustomerOrdersScreen()),
        routes: [
          GoRoute(
            path: ':orderId',
            builder: (_, state) =>
                OrderDetailScreen(orderId: state.pathParameters['orderId']!),
          ),
        ],
      ),
      GoRoute(
        path: '/subscription',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: SubscriptionScreen(
            reason: state.uri.queryParameters['reason'],
            // A subscription_expiry notification passes the user's current
            // plan so renewal is one tap on Pay.
            initialSeats: int.tryParse(
                state.uri.queryParameters['seats'] ?? ''),
            initialMonths: int.tryParse(
                state.uri.queryParameters['months'] ?? ''),
          ),
        ),
      ),
      GoRoute(
        path: '/notifications',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: NotificationsScreen()),
      ),
      // Followers list — where a `reel_follow` notification lands. Without a
      // :phone it means the signed-in user's own followers.
      GoRoute(
        path: '/followers',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: FollowersScreen(
            shopPhone: state.uri.queryParameters['phone'],
          ),
        ),
      ),
      // The actor list behind one grouped engagement notification.
      GoRoute(
        path: '/activity/:groupId',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: EngagementGroupScreen(
            groupId: state.pathParameters['groupId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/support',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: SupportScreen()),
      ),
      GoRoute(
        path: '/about',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: AboutScreen()),
      ),
      // krishidukan.com is a verified Android App Link / iOS Universal Link
      // (see AndroidManifest.xml), so a WhatsApp invoice link
      // (https://krishidukan.com/invoice/{orderId}) opens straight into this
      // app rather than a browser. Without a matching route this crashed
      // with "GoException: no routes for location" and stranded the customer
      // on a blank error screen — see invoice_screen.dart for the fix.
      GoRoute(
        path: '/invoice/:orderId',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: InvoiceScreen(orderId: state.pathParameters['orderId'] ?? ''),
        ),
      ),
      // Profile is now a full-screen pushed route (not a shell tab).
      // Access it via the brand icon in the top bar or context.push('/profile').
      GoRoute(
        path: '/profile',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: ProfileScreen()),
      ),
      GoRoute(
        path: '/profile/edit',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: ProfileEditScreen(
            reason: state.uri.queryParameters['reason'],
            // Set by a profile_incomplete notification — turns on the
            // "still missing" banner and outlines the empty required fields.
            highlight: state.uri.queryParameters['highlight'],
          ),
        ),
      ),
      GoRoute(
        path: '/profile/settings',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: SettingsScreen()),
      ),
      // ── Reels upload + shop profile (outside shell) ───────────────────
      GoRoute(
        path: '/reels/upload',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: ReelUploadScreen()),
      ),
      // Shared reel links: the deep-link redirect above maps
      // /reels/{slug}-{id} to /reel/{id}, which was never registered — shared
      // links fell through to a 404 until this route existed.
      GoRoute(
        path: '/reel/:id',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: ReelDeepLinkScreen(reelId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: '/shop/:phone',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: ShopProfileScreen(
            shopPhone: state.pathParameters['phone']!,
          ),
        ),
      ),
      // Full product catalogue for one shop, reached from the shop profile's
      // Products stat / "View All" tile.
      GoRoute(
        path: '/shop/:phone/products',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: ShopProductsScreen(
            shopPhone: state.pathParameters['phone']!,
            shopName: state.uri.queryParameters['name'],
          ),
        ),
      ),
      // ── Dashboard routes ─────────────────────────────────────────────────
      // "/dashboard" (Overview) has no route of its own — it redirects to
      // /profile in the redirect callback above.
      GoRoute(
        path: '/dashboard/inventory',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: InventoryScreen(
            autoOpenAdd: state.uri.queryParameters['autoAdd'] == '1',
            // Set by inventory_added / low_stock notifications so the product
            // they are about opens for editing straight away.
            focusProductId: state.uri.queryParameters['product'],
          ),
        ),
      ),
      GoRoute(
        path: '/dashboard/orders',
        parentNavigatorKey: _rootKey,
        // ?tab=requests — the order-offer notification and WhatsApp alert
        // land on the Requests tab (same query web's /dashboard/orders reads).
        builder: (_, state) => _RootBackFallback(
          child: SellerOrdersScreen(
            initialTab: state.uri.queryParameters['tab'],
          ),
        ),
      ),
      GoRoute(
        path: '/dashboard/subscription',
        parentNavigatorKey: _rootKey,
        builder: (_, _) =>
            const _RootBackFallback(child: SubscriptionDashboardScreen()),
      ),
      GoRoute(
        path: '/dashboard/payouts',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: PayoutsScreen()),
      ),
      GoRoute(
        path: '/dashboard/delivery',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: DeliverySettingsScreen()),
      ),
      GoRoute(
        path: '/dashboard/profile',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: DashboardProfileScreen()),
      ),
      GoRoute(
        path: '/dashboard/analytics',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: DashboardAnalyticsScreen(
            // 'week' | 'month' | 'year', from an analytics_digest notification.
            initialPeriod: state.uri.queryParameters['period'],
          ),
        ),
      ),
      GoRoute(
        path: '/dashboard/reviews',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: DashboardReviewsScreen()),
      ),
      // Buyer enquiries — lost checkouts this seller can still win back. Path
      // matches web's /dashboard/enquiry, which the WhatsApp alert links to.
      GoRoute(
        path: '/dashboard/enquiry',
        parentNavigatorKey: _rootKey,
        // ?id= — from the enquiry notification: that buyer is shown first.
        builder: (_, state) => _RootBackFallback(
          child: EnquiryScreen(focusId: state.uri.queryParameters['id']),
        ),
      ),
      GoRoute(
        path: '/dashboard/reels',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: DashboardReelsScreen()),
      ),
      // ── Manufacturer routes ───────────────────────────────────────────────
      GoRoute(
        path: '/dashboard/manufacturer',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: ManufacturerDashboardScreen()),
      ),
      GoRoute(
        path: '/dashboard/manufacturer/retailers',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: RetailerNetworkScreen()),
      ),
      GoRoute(
        path: '/dashboard/manufacturer/catalog',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: ManufacturerCatalogScreen(
            autoOpenAdd: state.uri.queryParameters['autoAdd'] == '1',
          ),
        ),
      ),
      GoRoute(
        path: '/dashboard/manufacturer/assign',
        parentNavigatorKey: _rootKey,
        builder: (_, state) {
          final phone = state.uri.queryParameters['retailerPhone'];
          return _RootBackFallback(
              child: AssignProductScreen(initialRetailerPhone: phone));
        },
      ),
      // Company Page: preview first (the page as customers see it, with an
      // Edit action), editor one level deeper. Previously the drawer link
      // went straight into the editor.
      GoRoute(
        path: '/dashboard/manufacturer/brand',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: _MyBrandPreview()),
      ),
      GoRoute(
        path: BrandScreen.editRoute,
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const _RootBackFallback(child: BrandEditorScreen()),
      ),
      GoRoute(
        path: '/hubs/:postId',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: HubDetailScreen(
            postId: state.pathParameters['postId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/brand/:phone',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => _RootBackFallback(
          child: BrandScreen(
            manufacturerPhone: state.pathParameters['phone']!,
          ),
        ),
      ),

      // ── Shell with bottom nav ─────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _homeKey,
            routes: [
              GoRoute(
                path: '/',
                redirect: (context, state) {
                  final view = state.uri.queryParameters['view'];
                  if (view == 'product') {
                    final productId = state.uri.queryParameters['product'];
                    if (productId != null && productId.isNotEmpty) {
                      return '/product/$productId';
                    }
                  }
                  return null;
                },
                builder: (_, _) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _marketKey,
            routes: [
              GoRoute(
                path: '/marketplace',
                builder: (context, state) {
                  final q = state.uri.queryParameters;
                  return MarketplaceScreen(
                    initialCategory: q['category'],
                    searchFocusToken: q['focus'],
                    // Store-scoped browsing (from "View Store Products").
                    sellerPhone: q['seller'],
                    sellerStoreId: q['sellerId'],
                    sellerUid: q['sellerUid'],
                    sellerName: q['sellerName'],
                  );
                },
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _hubsKey,
            routes: [
              GoRoute(path: '/hubs', builder: (_, _) => const HubsScreen()),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _storesKey,
            routes: [
              GoRoute(
                path: '/stores',
                builder: (_, state) {
                  final q = state.uri.queryParameters;
                  final lat = double.tryParse(q['focusLat'] ?? '');
                  final lng = double.tryParse(q['focusLng'] ?? '');
                  final name = q['focusName'];
                  StoreModel? focus;
                  if ((lat != null && lng != null) ||
                      (name != null && name.isNotEmpty)) {
                    final phone = q['focusPhone'];
                    focus = StoreModel(
                      id: q['focusId']?.isNotEmpty == true
                          ? q['focusId']!
                          : (phone?.isNotEmpty == true ? phone! : (name ?? 'focus')),
                      name: name ?? 'Store',
                      phone: phone,
                      address: q['focusAddress'],
                      lat: lat,
                      lng: lng,
                    );
                  }
                  return StoreLocatorScreen(initialFocusStore: focus);
                },
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _reelsKey,
            routes: [
              GoRoute(
                path: '/reels',
                builder: (_, state) => ReelsFeedScreen(
                  searchToken: state.uri.queryParameters['search'],
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _RouterRefreshNotifier extends ChangeNotifier {
  late final ProviderSubscription _authSub;
  late final ProviderSubscription _userSub;

  _RouterRefreshNotifier(Ref ref) {
    _authSub = ref.listen<AsyncValue>(
      authStateProvider,
      (_, _) => notifyListeners(),
      fireImmediately: true,
    );
    // Re-evaluate redirects when user doc loads (fixes paywall race condition)
    _userSub = ref.listen<AsyncValue>(currentUserProvider, (prev, next) {
      if (prev?.value == null && next.value != null) {
        notifyListeners();
      }
    }, fireImmediately: false);
  }

  @override
  void dispose() {
    _authSub.close();
    _userSub.close();
    super.dispose();
  }
}

class ReelsNavigatorObserver extends NavigatorObserver {
  final Ref ref;
  ReelsNavigatorObserver(this.ref);

  // ── helpers ──────────────────────────────────────────────────────────────

  /// Returns true when [route] is the shell route that hosts the reels tab.
  /// GoRouter represents the StatefulShellRoute with an anonymous MaterialRoute
  /// whose settings.name is null, but the INDIVIDUAL tab branch routes have
  /// the path in their name. We treat the reels feed as active only when the
  /// top-most route's name starts with '/reels' (and is exactly '/reels').
  bool _isReelsRoute(Route<dynamic>? route) {
    if (route == null) return false;
    final name = route.settings.name ?? '';
    // GoRouter sets route name = full path, e.g. "/reels"
    return name == '/reels';
  }

  void _setActive(bool active) {
    try {
      ref.read(reelsFeedPlaybackActiveProvider.notifier).setPlayable(active);
    } catch (_) {}
  }

  // ── NavigatorObserver overrides ───────────────────────────────────────────

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPush(route, previousRoute);
    // A new screen appeared on top — always pause immediately.
    // But if the pushed route IS the reels route itself (first load), resume.
    if (_isReelsRoute(route)) {
      _setActive(true);
    } else {
      _setActive(false);
    }
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPop(route, previousRoute);
    // The screen that was on top is gone; previousRoute is now the new top.
    _setActive(_isReelsRoute(previousRoute));
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didRemove(route, previousRoute);
    _setActive(_isReelsRoute(previousRoute));
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    super.didReplace(newRoute: newRoute, oldRoute: oldRoute);
    if (_isReelsRoute(newRoute)) {
      _setActive(true);
    } else {
      _setActive(false);
    }
  }
}



/// The signed-in manufacturer's own company page, in owner mode. Resolves the
/// phone from the current user so the drawer link needs no parameter.
class _MyBrandPreview extends ConsumerWidget {
  const _MyBrandPreview();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;
    final phone = user?.phone ?? '';
    if (phone.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return BrandScreen(manufacturerPhone: phone, isOwner: true);
  }
}
