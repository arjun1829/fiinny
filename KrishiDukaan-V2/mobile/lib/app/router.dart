import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/constants.dart';
import '../core/session.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/cart/cart_screen.dart';
import '../features/home/home_screen.dart';
import '../features/hub/hub_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/manufacturer/manufacturer_screen.dart';
import '../features/market/market_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/product/product_detail_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/retailer/retailer_screen.dart';
import '../features/splash/splash_screen.dart';
import '../features/store_locator/stores_screen.dart';
import '../features/subscription/subscription_screen.dart';
import '../features/welcome/welcome_screen.dart';
import 'shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: _SessionListenable(ref),
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final loc = state.matchedLocation;

      final isPublic = loc == '/splash' ||
          loc == '/welcome' ||
          loc == '/login' ||
          loc.startsWith('/otp');

      if (!session.isAuthenticated && !isPublic) return '/welcome';
      if (session.isAuthenticated &&
          !session.onboardingDone &&
          loc != '/onboarding') {
        return '/onboarding';
      }
      if (session.isAuthenticated &&
          session.onboardingDone &&
          isPublic &&
          loc != '/splash') {
        return '/home';
      }
      // Paywall: retailer/manufacturer who hasn't subscribed yet gets gated
      // when they try to access /dashboard, /retailer, or /manufacturer.
      final isDashboardRoute = loc == '/dashboard' ||
          loc == '/retailer' ||
          loc == '/manufacturer';
      final needsPaywall = session.isAuthenticated &&
          isDashboardRoute &&
          !session.isSubscribed &&
          (session.role == UserRole.retailer ||
              session.role == UserRole.manufacturer);
      if (needsPaywall) return '/subscribe';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/welcome', builder: (_, __) => const WelcomeScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/otp',
        builder: (_, s) => OtpScreen(
          phone: s.uri.queryParameters['phone'] ?? '',
          verificationId: s.uri.queryParameters['vid'] ?? '',
        ),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (_, __) => const OnboardingScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
          GoRoute(path: '/market', builder: (_, __) => const MarketScreen()),
          GoRoute(path: '/hub', builder: (_, __) => const HubScreen()),
          GoRoute(path: '/stores', builder: (_, __) => const StoresScreen()),
        ],
      ),
      GoRoute(
        path: '/profile',
        builder: (_, __) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/retailer',
        builder: (_, __) => const RetailerScreen(),
      ),
      GoRoute(
        path: '/manufacturer',
        builder: (_, __) => const ManufacturerScreen(),
      ),
      GoRoute(
        path: '/dashboard',
        builder: (_, __) => const DashboardScreen(),
      ),
      GoRoute(
        path: '/product/:id',
        builder: (_, s) =>
            ProductDetailScreen(productId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/subscribe',
        builder: (_, __) => const SubscriptionScreen(),
      ),
      GoRoute(
        path: '/cart',
        builder: (_, __) => const CartScreen(),
      ),
    ],
  );
});

class _SessionListenable extends ChangeNotifier {
  _SessionListenable(Ref ref) {
    ref.listen(sessionProvider, (_, __) => notifyListeners());
  }
}
