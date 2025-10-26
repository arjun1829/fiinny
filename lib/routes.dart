// lib/routes.dart
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart'; // NEW: to derive userPhone when missing

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
import 'screens/gmail_link_screen.dart';
import 'screens/premium_paywall.dart';
import 'screens/transactions_screen.dart';

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

// ---------- Friend recurring (NEW route target) ----------
import 'details/recurring/friend_recurring_screen.dart';

import 'screens/subs_bills/subs_bills_screen.dart';
import 'screens/tx_day_details_screen.dart';

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
  '/settings/gmail': (ctx) {
    final args = ModalRoute.of(ctx)!.settings.arguments as String;
    return GmailLinkScreen(userPhone: args);
  },

  // ------- Deeplink targets (kept as safe stubs for now) -------
  '/partner-dashboard': (_) => const _SimpleStubScreen(title: 'Partner Dashboard'),
  '/friends': (_) => const _SimpleStubScreen(title: 'Friends & Settle Up'),
  '/budget': (_) => const _SimpleStubScreen(title: 'Weekly Budget'),
  '/transactions': (ctx) {
    final phone = ModalRoute.of(ctx)?.settings.arguments as String? ?? '';
    return TransactionsScreen(userPhone: phone);
  },
};

/// Routes that require arguments (or custom building) are handled here.
Route<dynamic>? appOnGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;

  switch (settings.name) {
  /* ------------------ NEW: Subscriptions & Bills ------------------ */
    case '/subscriptions-bills':
    case '/subs-bills': // alias
      {
        String? userPhone;
        if (args is String) {
          userPhone = args;
        } else if (args is Map<String, dynamic>) {
          if (args['userPhone'] is String) {
            userPhone = args['userPhone'] as String;
          } else if (args['userId'] is String) {
            userPhone = args['userId'] as String;
          }
        }
        // Derive from FirebaseAuth if not provided
        userPhone ??= FirebaseAuth.instance.currentUser?.phoneNumber ??
            FirebaseAuth.instance.currentUser?.uid;
        return MaterialPageRoute(
          builder: (_) => SubsBillsScreen(userPhone: userPhone),
          settings: settings,
        );
      }

    case '/tx-day-details':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => TxDayDetailsScreen(userPhone: args),
        );
      }
      if (args is Map<String, dynamic> && args['userPhone'] is String) {
        return MaterialPageRoute(
          builder: (_) => TxDayDetailsScreen(userPhone: args['userPhone'] as String),
        );
      }
      break;

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

    case '/premium':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => PremiumPaywallScreen(userPhone: args));
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
      if (args is String && args.isNotEmpty) {
        return MaterialPageRoute(builder: (_) => LoansScreen(userId: args));
      }
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

  /* ------------------ NEW: Friend Recurring (deeplink target) ------------------ */
    case '/friend-recurring':
    // Accept:
    //   - String friendId
    //   - Map { friendId, userPhone?, friendName?, section? }
      {
        String? friendId;
        String? userPhone;
        String? friendName;

        if (args is String) {
          friendId = args;
        } else if (args is Map<String, dynamic>) {
          if (args['friendId'] is String) friendId = args['friendId'] as String;
          if (args['userPhone'] is String) userPhone = args['userPhone'] as String?;
          if (args['friendName'] is String) friendName = args['friendName'] as String?;
          // args['section'] is optional; if you need it later, read it in the screen via settings.arguments
        }

        // Derive userPhone if missing (phoneNumber first, fallback to uid)
        userPhone ??= FirebaseAuth.instance.currentUser?.phoneNumber ??
            FirebaseAuth.instance.currentUser?.uid ??
            '';

        if (friendId != null && friendId.isNotEmpty) {
          return MaterialPageRoute(
            builder: (_) => FriendRecurringScreen(
              userPhone: userPhone!,
              friendId: friendId!,
              friendName: friendName,
            ),
            settings: settings, // keep settings so screen can inspect section if needed
          );
        }
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
