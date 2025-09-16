// lib/routes.dart
import 'package:flutter/material.dart';

// ---------- Static screens (no arguments) ----------
import 'screens/onboarding_screen.dart';
import 'screens/launcher_screen.dart';
import 'screens/profile_screen.dart';

// ---------- Screens that need arguments ----------
import 'screens/dashboard_screen.dart';
import 'screens/expenses_screen.dart';
import 'screens/goals_screen.dart';
import 'screens/add_transaction_screen.dart';
import 'screens/add_loan_screen.dart';
import 'screens/add_asset_screen.dart'; // legacy AddAsset (still supported)
import 'screens/loans_screen.dart';
import 'screens/assets_screen.dart';
import 'screens/crisis_mode_screen.dart';
import 'screens/insight_feed_screen.dart';
import 'screens/transaction_count_screen.dart';
import 'screens/transaction_amount_screen.dart';
import 'screens/analytics_screen.dart'; // ✅ we’ll instantiate this in onGenerate

// ---------- Services for typed args ----------
import 'services/user_data.dart';

// ---------- Portfolio module (no-arg) ----------
import 'fiinny_assets/modules/portfolio/screens/portfolio_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/asset_type_picker_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/add_asset_entry_screen.dart';

// ---------- Devtools ----------
import 'ui_devtools/parse_debug_screen.dart';

// ---------- Settings screens ----------
import 'screens/notification_prefs_screen.dart'; // ✅ correct import

/// Static routes that don't require arguments.
/// (Do NOT put `/analytics` here because it requires a userPhone.)
final Map<String, WidgetBuilder> appRoutes = {
  // Core
  '/launcher': (_) => const LauncherScreen(),
  '/onboarding': (_) => const OnboardingScreen(),
  '/profile': (_) => const ProfileScreen(),

  // Portfolio flow
  '/portfolio': (_) => const PortfolioScreen(),
  '/asset-type-picker': (_) => const AssetTypePickerScreen(),
  '/add-asset-entry': (_) => const AddAssetEntryScreen(),

  // Devtools
  '/parse-debug': (_) => const ParseDebugScreen(),

  // Settings
  '/settings/notifications': (_) => const NotificationPrefsScreen(),

  // ------- Deeplink targets (kept as safe stubs for now) -------
  '/partner-dashboard': (_) => const _SimpleStubScreen(title: 'Partner Dashboard'),
  '/friends': (_) => const _SimpleStubScreen(title: 'Friends & Settle Up'),
  '/budget': (_) => const _SimpleStubScreen(title: 'Weekly Budget'),
};

/// Routes that require arguments (or custom building) are handled here.
Route<dynamic>? appOnGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;

  switch (settings.name) {
    case '/dashboard':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => DashboardScreen(userPhone: args));
      }
      break;

  // Accept both '/expense' and '/expenses'
    case '/expense':
    case '/expenses':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => ExpensesScreen(userPhone: args));
      }
      break;

    case '/analytics':
    // Accept either a raw String phone or a Map {'userPhone': '<phone>'}
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AnalyticsScreen(userPhone: args));
      }
      if (args is Map<String, dynamic> && args['userPhone'] is String) {
        return MaterialPageRoute(builder: (_) => AnalyticsScreen(userPhone: args['userPhone'] as String));
      }
      break;

  // Optional aliases: route them to AnalyticsScreen as well (no preset filter needed)
    case '/analytics-weekly':
    case '/analytics-monthly':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AnalyticsScreen(userPhone: args));
      }
      if (args is Map<String, dynamic> && args['userPhone'] is String) {
        return MaterialPageRoute(builder: (_) => AnalyticsScreen(userPhone: args['userPhone'] as String));
      }
      break;

    case '/notifications':
    // Optional String userId
      final userId = args is String ? args : null;
      return MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Notifications')),
          body: Center(
            child: Text(
              userId == null ? 'Notifications' : 'Notifications for $userId',
              style: const TextStyle(fontSize: 16),
            ),
          ),
        ),
      );

    case '/goals':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => GoalsScreen(userId: args));
      }
      break;

    case '/add':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AddTransactionScreen(userId: args));
      }
      break;

    case '/addLoan':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AddLoanScreen(userId: args));
      }
      break;

  // Legacy AddAsset (kept for backward compat)
    case '/addAsset':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AddAssetScreen(userId: args));
      }
      break;

    case '/loans':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => LoansScreen(userId: args['userId'] as String));
      }
      break;

    case '/assets':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => AssetsScreen(userId: args['userId'] as String));
      }
      break;

    case '/crisisMode':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['creditCardBill'] is num &&
          args['salary'] is num) {
        return MaterialPageRoute(
          builder: (_) => CrisisModeScreen(
            userId: args['userId'] as String,
            creditCardBill: (args['creditCardBill'] as num).toDouble(),
            salary: (args['salary'] as num).toDouble(),
          ),
        );
      }
      break;

    case '/insights':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['userData'] is UserData) {
        return MaterialPageRoute(
          builder: (_) => InsightFeedScreen(
            userId: args['userId'] as String,
            userData: args['userData'] as UserData,
          ),
        );
      }
      break;

    case '/transactionCount':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => TransactionCountScreen(userId: args));
      }
      break;

    case '/transactionAmount':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => TransactionAmountScreen(userId: args));
      }
      break;

    default:
      return null;
  }

  // If we reached here, the arguments were missing/wrong type.
  return MaterialPageRoute(
    builder: (_) => _BadRouteArgsScreen(
      routeName: settings.name ?? 'unknown',
      args: args,
    ),
  );
}

class _BadRouteArgsScreen extends StatelessWidget {
  final String routeName;
  final Object? args;
  const _BadRouteArgsScreen({required this.routeName, this.args});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Navigation error')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 48),
            const SizedBox(height: 12),
            Text('Invalid or missing arguments for route "$routeName".'),
            const SizedBox(height: 8),
            Text('Received: $args'),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Go back'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SimpleStubScreen extends StatelessWidget {
  final String title;
  const _SimpleStubScreen({required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Text(
          '$title (stub)\nReplace this route with your real screen anytime.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ),
    );
  }
}
