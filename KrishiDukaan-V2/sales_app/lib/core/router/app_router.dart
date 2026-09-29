import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/attendance/screens/attendance_screen.dart';
import '../../features/auth/screens/access_denied_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/splash_screen.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';
import '../../features/day_session/screens/session_detail_screen.dart';
import '../../features/day_session/screens/sessions_screen.dart';
import '../../features/dealers/screens/dealer_detail_screen.dart';
import '../../features/dealers/screens/dealers_screen.dart';
import '../../features/expenses/screens/expenses_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/reports/screens/reports_screen.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_shell.dart';

class Routes {
  Routes._();
  static const splash = '/splash';
  static const login = '/login';
  static const denied = '/denied';
  static const home = '/home';
  static const dealers = '/dealers';
  static const expenses = '/expenses';
  static const reports = '/reports';
  static const sessions = '/sessions';
  static const attendance = '/attendance';
  static const profile = '/profile';
}

final _rootKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final listenable = _SessionListenable(ref);
  ref.onDispose(listenable.dispose);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.splash,

    // Re-evaluate the guard whenever the session resolves or the rep signs out.
    refreshListenable: listenable,

    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final loc = state.matchedLocation;

      // Still resolving the role — hold on the splash rather than bouncing the
      // rep through the login screen on every cold start.
      if (session.isLoading || !session.hasValue) {
        return loc == Routes.splash ? null : Routes.splash;
      }

      switch (session.requireValue.status) {
        case SessionStatus.loading:
          return loc == Routes.splash ? null : Routes.splash;
        case SessionStatus.signedOut:
          return loc == Routes.login ? null : Routes.login;
        case SessionStatus.unauthorized:
          return loc == Routes.denied ? null : Routes.denied;
        case SessionStatus.ready:
          // Signed in: never leave them parked on an auth screen.
          if (loc == Routes.login ||
              loc == Routes.splash ||
              loc == Routes.denied) {
            return Routes.home;
          }
          return null;
      }
    },

    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: Routes.denied,
        builder: (_, _) => const AccessDeniedScreen(),
      ),

      // Four primary tabs, each keeping its own navigation stack.
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.home,
                builder: (_, _) => const DashboardScreen(),
                routes: [
                  GoRoute(
                    path: 'sessions',
                    builder: (_, _) => const SessionsScreen(),
                    routes: [
                      GoRoute(
                        path: ':sessionId',
                        builder: (_, s) => SessionDetailScreen(
                          sessionId: s.pathParameters['sessionId']!,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'attendance',
                    builder: (_, _) => const AttendanceScreen(),
                  ),
                  GoRoute(
                    path: 'profile',
                    builder: (_, _) => const ProfileScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.dealers,
                builder: (_, _) => const DealersScreen(),
                routes: [
                  GoRoute(
                    path: ':dealerId',
                    builder: (_, s) => DealerDetailScreen(
                      dealerId: s.pathParameters['dealerId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.expenses,
                builder: (_, _) => const ExpensesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.reports,
                builder: (_, _) => const ReportsScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

/// Bridges the Riverpod session state to GoRouter's refresh mechanism.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
  }
}
