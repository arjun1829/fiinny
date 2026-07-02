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
import '../../features/cart/screens/cart_screen.dart';
import '../../features/cart/screens/checkout_screen.dart';
import '../../features/orders/screens/customer_orders_screen.dart';
import '../../features/orders/screens/order_detail_screen.dart';
import '../../features/hubs/screens/hubs_screen.dart';
import '../../features/hubs/screens/hub_detail_screen.dart';
import '../../features/brand/screens/brand_screen.dart';
import '../../features/dashboard/screens/dashboard_home_screen.dart';
import '../../features/dashboard/screens/inventory_screen.dart';
import '../../features/dashboard/screens/seller_orders_screen.dart';
import '../../features/dashboard/screens/delivery_settings_screen.dart';
import '../../features/dashboard/screens/subscription_screen.dart';
import '../../features/manufacturer/screens/manufacturer_dashboard_screen.dart';
import '../../features/manufacturer/screens/retailer_network_screen.dart';
import '../../features/manufacturer/screens/manufacturer_catalog_screen.dart';
import '../../features/manufacturer/screens/assign_product_screen.dart';
import '../../features/manufacturer/screens/brand_editor_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/profile/screens/profile_edit_screen.dart';
import '../../features/notifications/notifications.dart';
import '../../features/support/screens/support_screen.dart';
import '../../features/welcome/screens/splash_screen.dart';
import '../../features/welcome/screens/welcome_screen.dart';
import '../../features/reels/screens/reels_feed_screen.dart';
import '../../features/reels/screens/reel_upload_screen.dart';
import '../../features/reels/screens/shop_profile_screen.dart';


final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _homeKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _marketKey = GlobalKey<NavigatorState>(debugLabel: 'market');
final _hubsKey = GlobalKey<NavigatorState>(debugLabel: 'hubs');
final _storesKey = GlobalKey<NavigatorState>(debugLabel: 'stores');
final _reelsKey = GlobalKey<NavigatorState>(debugLabel: 'reels');

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = _RouterRefreshNotifier(ref);
  ref.onDispose(notifier.dispose);

  return GoRouter(
    navigatorKey: _rootKey,
    refreshListenable: notifier,
    initialLocation: '/splash',
    redirect: (context, state) {
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

      final isAuthPath = path == '/login' ||
          path == '/login/otp' ||
          path == '/onboarding';

      const protectedPaths = ['/checkout', '/orders', '/dashboard'];
      final needsAuth = protectedPaths.any((p) => path.startsWith(p));

      if (!isLoggedIn && needsAuth) {
        return '/login?redirect=${Uri.encodeComponent(path)}';
      }

      if (isLoggedIn && isAuthPath) {
        final currentUser = ref.read(currentUserProvider).value;
        if (currentUser == null && path != '/onboarding') return '/onboarding';
        if (currentUser != null) return '/';
      }

      if (isLoggedIn && path.startsWith('/dashboard')) {
        final canAccess = ref.read(canAccessDashboardProvider);
        if (!canAccess) return '/subscription?reason=paywall';
      }

      if (isLoggedIn && path.startsWith('/dashboard/manufacturer')) {
        if (!ref.read(isManufacturerProvider)) return '/dashboard';
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
        builder: (_, state) => PhoneEntryScreen(
          redirectAfterLogin: state.uri.queryParameters['redirect'],
          inviteCode: state.uri.queryParameters['inviteCode'],
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
        ),
      ),

      // ── Full-screen routes (outside shell) ───────────────────────────
      GoRoute(
        path: '/product/:catalogId',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => ProductDetailScreen(
          catalogId: state.pathParameters['catalogId']!,
        ),
      ),
      GoRoute(
        path: '/cart',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const CartScreen(),
      ),
      GoRoute(
        path: '/checkout',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const CheckoutScreen(),
      ),
      GoRoute(
        path: '/orders',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const CustomerOrdersScreen(),
        routes: [
          GoRoute(
            path: ':orderId',
            builder: (_, state) => OrderDetailScreen(
              orderId: state.pathParameters['orderId']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/subscription',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => SubscriptionScreen(
          reason: state.uri.queryParameters['reason'],
        ),
      ),
      GoRoute(
        path: '/notifications',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/support',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const SupportScreen(),
      ),
      // Profile is now a full-screen pushed route (not a shell tab).
      // Access it via the brand icon in the top bar or context.push('/profile').
      GoRoute(
        path: '/profile',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/profile/edit',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => ProfileEditScreen(
          reason: state.uri.queryParameters['reason'],
        ),
      ),
      // ── Reels upload + shop profile (outside shell) ───────────────────
      GoRoute(
        path: '/reels/upload',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const ReelUploadScreen(),
      ),
      GoRoute(
        path: '/shop/:phone',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => ShopProfileScreen(
          shopPhone: state.pathParameters['phone']!,
        ),
      ),
      // ── Dashboard routes ─────────────────────────────────────────────────
      GoRoute(
        path: '/dashboard',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const DashboardHomeScreen(),
      ),
      GoRoute(
        path: '/dashboard/inventory',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const InventoryScreen(),
      ),
      GoRoute(
        path: '/dashboard/orders',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const SellerOrdersScreen(),
      ),
      GoRoute(
        path: '/dashboard/delivery',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const DeliverySettingsScreen(),
      ),
      // ── Manufacturer routes ───────────────────────────────────────────────
      GoRoute(
        path: '/dashboard/manufacturer',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const ManufacturerDashboardScreen(),
      ),
      GoRoute(
        path: '/dashboard/manufacturer/retailers',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const RetailerNetworkScreen(),
      ),
      GoRoute(
        path: '/dashboard/manufacturer/catalog',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const ManufacturerCatalogScreen(),
      ),
      GoRoute(
        path: '/dashboard/manufacturer/assign',
        parentNavigatorKey: _rootKey,
        builder: (_, state) {
          final phone = state.uri.queryParameters['retailerPhone'];
          return AssignProductScreen(initialRetailerPhone: phone);
        },
      ),
      GoRoute(
        path: '/dashboard/manufacturer/brand',
        parentNavigatorKey: _rootKey,
        builder: (_, _) => const BrandEditorScreen(),
      ),
      GoRoute(
        path: '/hubs/:postId',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => HubDetailScreen(
          postId: state.pathParameters['postId']!,
        ),
      ),
      GoRoute(
        path: '/brand/:phone',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => BrandScreen(
          manufacturerPhone: state.pathParameters['phone']!,
        ),
      ),

      // ── Shell with bottom nav ─────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(navigatorKey: _homeKey, routes: [
            GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
          ]),
          StatefulShellBranch(navigatorKey: _marketKey, routes: [
            GoRoute(
                path: '/marketplace',
                builder: (context, state) {
                  final category = state.uri.queryParameters['category'];
                  return MarketplaceScreen(
                    initialCategory: category,
                    searchFocusToken: state.uri.queryParameters['focus'],
                  );
                }),
          ]),
          StatefulShellBranch(navigatorKey: _hubsKey, routes: [
            GoRoute(path: '/hubs', builder: (_, _) => const HubsScreen()),
          ]),
          StatefulShellBranch(navigatorKey: _storesKey, routes: [
            GoRoute(
                path: '/stores',
                builder: (_, _) => const StoreLocatorScreen()),
          ]),
          StatefulShellBranch(navigatorKey: _reelsKey, routes: [
            GoRoute(
                path: '/reels', builder: (_, _) => const ReelsFeedScreen()),
          ]),
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
    _userSub = ref.listen<AsyncValue>(
      currentUserProvider,
      (prev, next) {
        if (prev?.value == null && next.value != null) {
          notifyListeners();
        }
      },
      fireImmediately: false,
    );
  }

  @override
  void dispose() {
    _authSub.close();
    _userSub.close();
    super.dispose();
  }
}
