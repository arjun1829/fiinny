import 'package:flutter/material.dart';

// Static Screens (no arguments)
import 'screens/onboarding_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/expenses_screen.dart';
import 'screens/launcher_screen.dart';
import 'screens/welcome_screen.dart';
import 'screens/auth_gate.dart';

// Screens that need arguments
import 'screens/dashboard_screen.dart';
import 'screens/goals_screen.dart';
import 'screens/add_transaction_screen.dart';
import 'screens/add_loan_screen.dart';
import 'screens/add_asset_screen.dart';
import 'screens/loans_screen.dart';
import 'screens/assets_screen.dart';
import 'screens/crisis_mode_screen.dart';
import 'screens/insight_feed_screen.dart';
import 'screens/transaction_count_screen.dart';
import 'screens/transaction_amount_screen.dart';
import 'screens/main_nav_screen.dart';

import 'services/user_data.dart'; // For InsightFeedScreen

// ---------- Simple (no-args) named routes ----------
final Map<String, WidgetBuilder> appRoutes = {
  '/launcher': (_) => const LauncherScreen(),
  '/welcome': (_) => const WelcomeScreen(),
  '/auth': (_) => const AuthGate(),
  '/onboarding': (_) => const OnboardingScreen(),
  '/profile': (_) => ProfileScreen(),
  '/analytics': (_) => const AnalyticsScreen(),
};

// ---------- Routes that need arguments ----------
Route<dynamic>? appOnGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;

  switch (settings.name) {
  // Entry to main tabbed app — expects String userPhone
    case '/main':
      if (args is String && args.isNotEmpty) {
        return MaterialPageRoute(
          builder: (_) => MainNavScreen(userPhone: args),
        );
      }
      return _badArgs(settings.name, 'String userPhone');

    case '/dashboard':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => DashboardScreen(userPhone: args),
        );
      }
      return _badArgs(settings.name, 'String userPhone');

    case '/expenses':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => ExpensesScreen(userPhone: args),
        );
      }
      return _badArgs(settings.name, 'String userPhone');

    case '/goals':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => GoalsScreen(userId: args),
        );
      }
      return _badArgs(settings.name, 'String userId');

    case '/add':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => AddTransactionScreen(userId: args),
        );
      }
      return _badArgs(settings.name, 'String userId');

    case '/addLoan':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => AddLoanScreen(userId: args),
        );
      }
      return _badArgs(settings.name, 'String userId');

    case '/addAsset':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => AddAssetScreen(userId: args),
        );
      }
      return _badArgs(settings.name, 'String userId');

    case '/loans':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => LoansScreen(userId: args['userId'] as String),
        );
      }
      return _badArgs(settings.name, "{ 'userId': String }");

    case '/assets':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => AssetsScreen(userId: args['userId'] as String),
        );
      }
      return _badArgs(settings.name, "{ 'userId': String }");

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
      return _badArgs(
        settings.name,
        "{ 'userId': String, 'creditCardBill': double, 'salary': double }",
      );

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
      return _badArgs(settings.name, "{ 'userId': String, 'userData': UserData }");

    case '/transactionCount':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => TransactionCountScreen(userId: args),
        );
      }
      return _badArgs(settings.name, 'String userId');

    case '/transactionAmount':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => TransactionAmountScreen(userId: args),
        );
      }
      return _badArgs(settings.name, 'String userId');

    default:
      return null;
  }
}

// ---------- helper for bad/missing arguments ----------
Route<dynamic> _badArgs(String? routeName, String expected) {
  return MaterialPageRoute(
    builder: (_) => Scaffold(
      appBar: AppBar(title: const Text('Route error')),
      body: Center(
        child: Text(
          'Route "$routeName" called with wrong/missing arguments.\nExpected: $expected',
          textAlign: TextAlign.center,
        ),
      ),
    ),
  );
}
