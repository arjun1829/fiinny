// lib/main.dart
import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timezone/data/latest.dart' as tz;

import 'themes/theme_provider.dart';
import 'services/notification_service.dart';
import 'firebase_options.dart';
import 'services/push/push_service.dart';

import 'screens/launcher_screen.dart';
import 'routes.dart';

// ✅ Portfolio module routes
import 'fiinny_assets/modules/portfolio/screens/portfolio_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/asset_type_picker_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/add_asset_entry_screen.dart';

// ✅ TxDayDetailsScreen import
import 'screens/tx_day_details_screen.dart';

// Global navigator key (for deeplinks / notif taps)
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

// Firebase auth stream lives for the lifetime of the process.
// ignore: cancel_subscriptions
StreamSubscription<User?>? _authChangesSub;
bool _pushInitInFlight = false;
bool _pushInitScheduled = false;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    final stack = details.stack ?? StackTrace.current;
    Zone.current.handleUncaughtError(details.exception, stack);
  };

  await _bootstrapFoundation();

  final themeProvider = ThemeProvider();
  await themeProvider.loadTheme();

  _listenForAuthAndPush();
  _schedulePushInit();

  runZonedGuarded(() {
    runApp(
      ChangeNotifierProvider<ThemeProvider>.value(
        value: themeProvider,
        child: const FiinnyApp(),
      ),
    );
  }, (error, stack) {
    debugPrint('[main] Uncaught zone error: $error');
    debugPrint(stack.toString());
  });
}

Future<void> _bootstrapFoundation() async {
  await tz.initializeTimeZones();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await NotificationService.initialize();
}

void _listenForAuthAndPush() {
  _authChangesSub ??=
      FirebaseAuth.instance.authStateChanges().listen((user) {
    if (user == null) return;
    _schedulePushInit();
  });
}

void _schedulePushInit({bool force = false}) {
  if (_pushInitInFlight && !force) return;
  if (_pushInitScheduled && !force) return;

  _pushInitScheduled = true;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    _pushInitScheduled = false;
    unawaited(_safePushInit(force: force));
  });
}

Future<void> _safePushInit({bool force = false}) async {
  if (_pushInitInFlight && !force) return;
  _pushInitInFlight = true;
  try {
    await PushService.init().timeout(const Duration(seconds: 8));
  } catch (e, stack) {
    debugPrint('[main] Push init skipped/timeout: $e');
    debugPrint(stack.toString());
  } finally {
    _pushInitInFlight = false;
  }
}

class FiinnyApp extends StatelessWidget {
  const FiinnyApp({Key? key}) : super(key: key);

  // Merge-in portfolio routes
  Map<String, WidgetBuilder> get _portfolioRoutes => {
        '/portfolio': (_) => const PortfolioScreen(),
        '/asset-type-picker': (_) => const AssetTypePickerScreen(),
        '/add-asset-entry': (_) => const AddAssetEntryScreen(),
      };

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);

    return MaterialApp(
      title: 'Fiinny',
      debugShowCheckedModeBanner: false,
      theme: themeProvider.themeData,

      // Navigator key for deeplink navigation from notif taps
      navigatorKey: rootNavigatorKey,

      // Entry point: ✅ this remains the first screen
      home: const LauncherScreen(),

      // Static route table
      routes: {
        ...appRoutes, // from routes.dart
        ..._portfolioRoutes,
      },

      // Dynamic / typed routes
      onGenerateRoute: (settings) {
        // Keep existing generated routes first
        final generated = appOnGenerateRoute(settings);
        if (generated != null) return generated;

        // ✅ tx-day-details expects a String phone argument
        if (settings.name == '/tx-day-details') {
          final phone = settings.arguments as String;
          return MaterialPageRoute(
            builder: (_) => TxDayDetailsScreen(userPhone: phone),
            settings: settings,
          );
        }

        // Fallback for unknown routes
        return MaterialPageRoute(
          builder: (_) => _RouteNotFoundScreen(
            unknownRoute: settings.name ?? 'unknown',
          ),
        );
      },
    );
  }
}

class _RouteNotFoundScreen extends StatelessWidget {
  final String unknownRoute;
  const _RouteNotFoundScreen({required this.unknownRoute});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Route not found')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.link_off, size: 48),
              const SizedBox(height: 12),
              Text('Screen "${unknownRoute}" is not registered.'),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () =>
                    Navigator.pushReplacementNamed(context, '/portfolio'),
                child: const Text('Go to Portfolio'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
