import 'package:flutter/material.dart';

// Static Screens (no arguments)
import 'screens/onboarding_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/expenses_screen.dart';

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
import 'screens/launcher_screen.dart';

import 'services/user_data.dart'; // For InsightFeedScreen

final Map<String, WidgetBuilder> appRoutes = {
  '/launcher': (_) => const LauncherScreen(),
  '/onboarding': (_) => const OnboardingScreen(),
  '/profile': (_) => ProfileScreen(),
  '/analytics': (_) => const AnalyticsScreen(),
  // Screens that require arguments must be handled in onGenerateRoute.
};

Route<dynamic>? appOnGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;

  switch (settings.name) {
    case '/dashboard':
      return MaterialPageRoute(
        builder: (_) => DashboardScreen(userPhone: args as String),
      );
    case '/expenses':
      return MaterialPageRoute(
        builder: (_) => ExpensesScreen(userPhone: args as String),
      );

    case '/goals':
      return MaterialPageRoute(
        builder: (_) => GoalsScreen(userId: args as String),
      );

    case '/add':
      return MaterialPageRoute(
        builder: (_) => AddTransactionScreen(userId: args as String),
      );

    case '/addLoan':
      return MaterialPageRoute(
        builder: (_) => AddLoanScreen(userId: args as String),
      );

    case '/addAsset':
      return MaterialPageRoute(
        builder: (_) => AddAssetScreen(userId: args as String),
      );

    case '/loans':
      final map = args as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => LoansScreen(userId: map['userId'] as String),
      );

    case '/assets':
      final map = args as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => AssetsScreen(userId: map['userId'] as String),
      );

    case '/crisisMode':
      final map = args as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => CrisisModeScreen(
          userId: map['userId'] as String,
          creditCardBill: map['creditCardBill'] as double,
          salary: map['salary'] as double,
        ),
      );

    case '/insights':
      final map = args as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => InsightFeedScreen(
          userId: map['userId'] as String,
          userData: map['userData'] as UserData,
        ),
      );

  // 👇👇👇 Add your new routes for Transaction Count/Amount screens here!
    case '/transactionCount':
      return MaterialPageRoute(
        builder: (_) => TransactionCountScreen(userId: args as String),
      );

    case '/transactionAmount':
      return MaterialPageRoute(
        builder: (_) => TransactionAmountScreen(userId: args as String),
      );

    default:
      return null;
  }
}
