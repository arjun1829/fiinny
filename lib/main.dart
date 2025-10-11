// lib/main.dart
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:provider/provider.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'firebase_options.dart';

// Theme & notifications
import 'themes/theme_provider.dart';
import 'services/notification_service.dart';

// Push layer
import 'services/push/push_service.dart';

// Screens / routes
import 'screens/launcher_screen.dart';
import 'routes.dart';

// Portfolio module routes
import 'fiinny_assets/modules/portfolio/screens/portfolio_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/asset_type_picker_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/add_asset_entry_screen.dart';

// Typed route
import 'screens/tx_day_details_screen.dart';

// 🔔 Local one-shot notifications binder (Option B)
import 'core/notifications/local_notifications.dart';

// Ads (centralized service)
import 'core/ads/ad_service.dart';

// Global navigator key (for deeplinks / notif taps)
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

// ✅ Keep ONLY ONE main()
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Timezone DB (needed by NotificationService & LocalNotifs)
  tz.initializeTimeZones();

  // Configure Firebase once native runtime has booted. The native iOS runner
  // now bundles GoogleService-Info.plist and configures Firebase before Dart
  // when possible, so we only initialize here if no app instance exists yet.
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      debugPrint('[main] Firebase initialized via default platform options.');
    } else {
      debugPrint('[main] Firebase already configured before Dart execution.');
    }
  } on FirebaseException catch (e) {
    if (e.code == 'duplicate-app') {
      debugPrint('[main] Firebase already configured natively.');
    } else {
      debugPrint('[main] Firebase.initializeApp failed: ${e.code}');
      rethrow;
    }
  }

  // Your existing local notification wrapper
  await NotificationService.initialize();

  // 🔔 Initialize our LocalNotifs (safe to call multiple times)
  await LocalNotifs.init();

  // Ads (Google Mobile Ads) – init & preload
  await AdService.I.init();

  // Theme
  final themeProvider = ThemeProvider();
  await themeProvider.loadTheme();

  // Kick push init after first frame (non-blocking)
  WidgetsBinding.instance.addPostFrameCallback((_) {
    Future.microtask(_safePushInit);
  });

  // Also retry push init when user logs in (non-blocking)
  FirebaseAuth.instance.authStateChanges().listen((user) {
    if (user == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.microtask(_safePushInit);
    });
  });

  runApp(
    ChangeNotifierProvider.value(
      value: themeProvider,
      child: const FiinnyApp(),
    ),
  );
}

// Never await this in main/UI-critical paths.
Future<void> _safePushInit() async {
  try {
    await PushService.init().timeout(const Duration(seconds: 6));
  } catch (e) {
    // If APNs/FCM is slow or misconfigured, don't block the app.
    debugPrint('[main] Push init skipped/timeout: $e');
  }
}

class FiinnyApp extends StatelessWidget {
  const FiinnyApp({Key? key}) : super(key: key);

  // Portfolio routes
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

      // Entry point (unchanged)
      home: const LauncherScreen(),

      // Static routes
      routes: {
        ...appRoutes, // from routes.dart
        ..._portfolioRoutes,
      },

      // Dynamic / typed routes
      onGenerateRoute: (settings) {
        // Keep existing generated routes first
        final generated = appOnGenerateRoute(settings);
        if (generated != null) return generated;

        // tx-day-details expects a String phone argument
        if (settings.name == '/tx-day-details') {
          final phone = settings.arguments as String;
          return MaterialPageRoute(
            builder: (_) => TxDayDetailsScreen(userPhone: phone),
            settings: settings,
          );
        }

        // Fallback
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
  const _RouteNotFoundScreen({required this.unknownRoute, Key? key})
      : super(key: key);

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
              Text('Screen "$unknownRoute" is not registered.'),
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
