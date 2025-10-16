// lib/main.dart
import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:provider/provider.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'firebase_options.dart';

// Theme & notifications
import 'themes/theme_provider.dart';
import 'services/notification_service.dart';

// Push layer
import 'services/push/push_service.dart';
import 'services/push/first_surface_gate.dart';

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

bool _debugCrashlyticsSmokeTestSent = false;

// ✅ Keep ONLY ONE main()
Future<void> main() async {
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    final themeProvider = ThemeProvider();
    await themeProvider.loadTheme();

    await _ensureFirebaseInitialized();
    await _configureCrashlytics();
    await _initializeSupportingServices();

    _schedulePushBootstrap();

    runApp(
      ChangeNotifierProvider.value(
        value: themeProvider,
        child: const FiinnyApp(),
      ),
    );
  }, (error, stackTrace) async {
    debugPrint('[main] Uncaught zone error: $error\n$stackTrace');
    if (!kIsWeb) {
      try {
        await FirebaseCrashlytics.instance.recordError(
          error,
          stackTrace,
          fatal: true,
        );
      } catch (crashError, crashStack) {
        debugPrint('[main] Crashlytics.recordError failed: $crashError\n$crashStack');
      }
    }
  });
}

Future<void> _ensureFirebaseInitialized() async {
  // Configure Firebase once native runtime has booted. The native iOS runner
  // configures Firebase with bundled credentials when they are provided at
  // build time and otherwise falls back to manual options, so we only
  // initialize here if no app instance exists yet.
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
}

Future<void> _configureCrashlytics() async {
  if (kIsWeb) {
    return;
  }

  try {
    final crashlytics = FirebaseCrashlytics.instance;
    await crashlytics.setCrashlyticsCollectionEnabled(true);
    crashlytics.log('Fiinny boot ok ${DateTime.now().toIso8601String()}');

    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      crashlytics.recordFlutterFatalError(details);
    };

    PlatformDispatcher.instance.onError = (error, stack) {
      crashlytics.recordError(error, stack, fatal: true);
      return true;
    };

    assert(() {
      if (!_debugCrashlyticsSmokeTestSent) {
        _debugCrashlyticsSmokeTestSent = true;
        unawaited(
          crashlytics.recordError(
            Exception('Test non-fatal from Fiinny (verify Crashlytics)'),
            StackTrace.current,
            reason: 'debug smoke test',
          ),
        );
      }
      return true;
    }());
  } catch (error, stackTrace) {
    debugPrint('[main] Crashlytics setup failed: $error\n$stackTrace');
  }
}

Future<void> _initializeSupportingServices() async {
  await Future.wait([
    _guardAsync(
      'NotificationService.initialize',
      NotificationService.initialize,
      timeout: const Duration(seconds: 3),
    ),
    _guardAsync(
      'LocalNotifs.init',
      LocalNotifs.init,
      timeout: const Duration(seconds: 3),
    ),
    _guardAsync(
      'AdService.I.init',
      () => AdService.I.init(),
      timeout: const Duration(seconds: 4),
    ),
  ]);
}

// Prevent a single background service from holding the splash indefinitely.
Future<void> _guardAsync(
  String label,
  Future<void> Function() runner, {
  Duration timeout = const Duration(seconds: 5),
}) async {
  try {
    if (timeout == Duration.zero) {
      await runner();
    } else {
      await runner().timeout(timeout);
    }
  } on TimeoutException catch (error) {
    debugPrint('[main] $label timed out after ${timeout.inMilliseconds}ms: $error');
  } catch (error, stackTrace) {
    debugPrint('[main] $label failed: $error\n$stackTrace');
  }
}

Future<void>? _pushBootstrapInFlight;

void _schedulePushBootstrap() {
  void enqueueBootstrap() {
    if (_pushBootstrapInFlight != null) {
      // A bootstrap run is already queued/running. Let it finish instead of
      // spamming init/permission prompts while the Navigator is still mounting.
      return;
    }

    _pushBootstrapInFlight = _waitForNavigatorAndBootstrap().whenComplete(() {
      _pushBootstrapInFlight = null;
    });
  }

  // Kick push init after the very first frame but only once the navigator
  // tree is available. This avoids showing the permission dialog while the
  // app is still assembling its initial route (which manifested as a blank
  // screen on iOS when the system sheet stole focus mid-build).
  WidgetsBinding.instance.addPostFrameCallback((_) {
    enqueueBootstrap();
  });

  // Also retry push init when the user logs in (non-blocking)
  FirebaseAuth.instance.authStateChanges().listen((user) {
    if (user == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      enqueueBootstrap();
    });
  });
}

Future<void> _waitForNavigatorAndBootstrap() async {
  // Wait for the root navigator to mount so that any follow-up navigation from
  // notification taps has a stable target. Without this guard, iOS could end
  // up presenting the permission sheet while Flutter was still inflating the
  // first frame, leaving a permanently blank surface when the dialog was
  // dismissed.
  var attempts = 0;
  while (rootNavigatorKey.currentState == null && attempts < 10) {
    await Future.delayed(const Duration(milliseconds: 100));
    attempts++;
  }

  // Ensure at least one full frame has painted after the navigator attaches.
  await WidgetsBinding.instance.endOfFrame;

  // Defer push initialization until after the first navigation has safely
  // transitioned away from the launcher so iOS permission UI cannot interrupt
  // Flutter mid-frame. A timeout keeps us from hanging forever if something
  // goes wrong but still gives navigation a fair chance to complete.
  await FirstSurfaceGate.waitUntilReady(
    timeout: const Duration(seconds: 5),
  );

  await _safePushInit();
}

// Never await this in main/UI-critical paths.
Future<void> _safePushInit() async {
  try {
    await PushService.init().timeout(const Duration(seconds: 6));
  } catch (error, stackTrace) {
    // If APNs/FCM is slow or misconfigured, don't block the app.
    debugPrint('[main] Push init skipped/timeout: $error\n$stackTrace');
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
