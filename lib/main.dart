// lib/main.dart
import 'dart:async';
import 'dart:io' show Platform;
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:provider/provider.dart';
import 'package:workmanager/workmanager.dart';
import 'firebase_options.dart';
import 'routes.dart';
import 'core/ads/ad_service.dart';
import 'core/ads/ads_shell.dart';

import 'screens/launcher_screen.dart';
import 'themes/theme_provider.dart';
import 'services/ad_config.dart';
import 'services/consent_service.dart';
import 'services/startup_prefs.dart';
import 'services/sms/sms_ingestor.dart';

// Toggle from CI: --dart-define=SAFE_MODE=true
const bool SAFE_MODE = bool.fromEnvironment('SAFE_MODE', defaultValue: false);
const bool kDiagBuild = bool.fromEnvironment('DIAG_BUILD', defaultValue: false);
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
const MethodChannel _systemUiChannel = MethodChannel('lifemap/system_ui');

Future<void> configureSystemUI() async {
  if (!Platform.isAndroid) {
    return;
  }

  int sdk = 0;
  try {
    final result = await _systemUiChannel.invokeMethod<int>('getSdkInt');
    if (result != null) sdk = result;
  } catch (err) {
    debugPrint('System UI channel failed: $err');
  }

  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  if (sdk >= 35) {
    const style = SystemUiOverlayStyle(
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarIconBrightness: Brightness.dark,
    );
    SystemChrome.setSystemUIOverlayStyle(style);
  } else {
    const style = SystemUiOverlayStyle(
      statusBarColor: Color(0x00000000),
      systemNavigationBarColor: Color(0x00000000),
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarIconBrightness: Brightness.dark,
    );
    SystemChrome.setSystemUIOverlayStyle(style);
  }
}

@pragma('vm:entry-point')
void smsBackgroundDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    } catch (_) {}
    SmsIngestor.instance.init();
    final phone = inputData?['userPhone'] as String?;
    if (phone != null && phone.isNotEmpty) {
      try {
        await SmsIngestor.instance.syncDelta(
          userPhone: phone,
          lookbackHours: 48,
        );
      } catch (e) {
        debugPrint('[Workmanager] smsSync48h error: $e');
      }
    }
    return Future.value(true);
  });
}

void main() {
  final tracer = _StartupTracer();

  runZonedGuarded<Future<void>>(() async {
    WidgetsFlutterBinding.ensureInitialized();

    await configureSystemUI();

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        await Workmanager().initialize(smsBackgroundDispatcher);
      } catch (e) {
        debugPrint('Workmanager init failed: $e');
      }
    }

    if (SAFE_MODE) {
      runApp(MaterialApp(
        debugShowCheckedModeBanner: false,
        builder: (context, child) => AdsShell(child: child),
        home: const SafeModeScreen(),
      ));
      return;
    }

    // System ATT prompt only — no custom pre-prompt.
    AdConfig.authorized = await ConsentService.requestATTIfNeeded();

    await MobileAds.instance.initialize();
    AdService.updateConsent(authorized: AdConfig.authorized);

    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      tracer.add('FlutterError: ${details.exceptionAsString()}');
      if (kReleaseMode) {
        unawaited(FirebaseCrashlytics.instance.recordFlutterError(details));
      }
      Zone.current.handleUncaughtError(
          details.exception, details.stack ?? StackTrace.current);
    };

    runApp(_DiagApp(tracer: tracer));
    await _boot(tracer, attAllowed: AdConfig.authorized);
  }, (error, stack) async {
    tracer.add('Uncaught: $error');
    try {
      await FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    } catch (_) {}
  });
}

Future<void> _boot(_StartupTracer tracer, {required bool attAllowed}) async {
  tracer.add('BOOT start');
  tracer.add('Platform=${Platform.operatingSystem} diag=$kDiagBuild');

  await _ensureNavigatorReady();

  tracer.add('ATT status=${ConsentService.lastStatus} allowed=$attAllowed');
  AdService.updateConsent(authorized: attAllowed);
  if (!attAllowed && ConsentService.isDeniedOrRestricted) {
    unawaited(_showTrackingSettingsDialog());
  }

  try {
    tracer.add('Firebase.initializeApp…');
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)
        .timeout(const Duration(seconds: 8));
    tracer.add('Firebase ✅');
    await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(true);
    unawaited(AdService.initLater());

    FlutterError.onError = (FlutterErrorDetails details) {
      FlutterError.presentError(details);
      tracer.add('FlutterError: ${details.exceptionAsString()}');
      if (kReleaseMode) {
        FirebaseCrashlytics.instance.recordFlutterError(details);
      }
      Zone.current.handleUncaughtError(details.exception, details.stack ?? StackTrace.current);
    };

    PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
      if (kReleaseMode) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      }
      return true;
    };
  } catch (e) {
    tracer.add('Firebase ❌ $e');
  }

  final welcomeSeen = await StartupPrefs.hasSeenWelcome();
  var skipWelcome = welcomeSeen;

  if (!skipWelcome) {
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser != null) {
      skipWelcome = true;
      tracer.add(
          'Welcome flag missing but user ${currentUser.uid} already signed in → skip');
      unawaited(StartupPrefs.markWelcomeSeen());
    }
  }

  tracer.add(skipWelcome
      ? 'NAV → LauncherScreen (welcome skipped)'
      : 'NAV → LauncherScreen (welcome pending)');
  _DiagApp.navTo(const LauncherScreen());
  tracer.add('BOOT done (UI visible)');
}

Future<void> _ensureNavigatorReady() async {
  for (var i = 0; i < 20; i++) {
    if (rootNavigatorKey.currentContext != null) {
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 16));
  }
}

Future<void> _showTrackingSettingsDialog() async {
  final context = rootNavigatorKey.currentContext;
  if (context == null) {
    return;
  }

  await showDialog<void>(
    context: context,
    useRootNavigator: true,
    builder: (context) => const _AttSettingsDialog(),
  );
}

class _AttSettingsDialog extends StatelessWidget {
  const _AttSettingsDialog();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Tracking disabled'),
      content: const Text(
        'Ads will remain non-personalized. You can enable tracking later from '
        'iOS Settings → Privacy & Security → Tracking.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context, rootNavigator: true).pop(),
          child: const Text('Continue'),
        ),
        FilledButton(
          onPressed: () {
            Navigator.of(context, rootNavigator: true).pop();
            unawaited(ConsentService.openSettings());
          },
          child: const Text('Open Settings'),
        ),
      ],
    );
  }
}

class _DiagApp extends StatefulWidget {
  const _DiagApp({required this.tracer});
  final _StartupTracer tracer;

  static GlobalKey<NavigatorState> get navKey => rootNavigatorKey;
  static void navTo(Widget page) {
    navKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => page),
      (_) => false,
    );
  }

  @override
  State<_DiagApp> createState() => _DiagAppState();
}

class _DiagAppState extends State<_DiagApp> {
  VoidCallback? _tracerListener;

  void _afterFirstFrame(VoidCallback fn) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      fn();
    });
  }

  void _safeSetState(VoidCallback fn) {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(fn);
    });
  }

  @override
  void initState() {
    super.initState();
    _tracerListener = () {
      if (!mounted) return;
      _safeSetState(() {});
    };
    widget.tracer.attach(_tracerListener);
  }

  @override
  void dispose() {
    widget.tracer.attach(null);
    _tracerListener = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<ThemeProvider>(
      create: (_) {
        final provider = ThemeProvider();
        unawaited(provider.loadTheme());
        return provider;
      },
      child: Consumer<ThemeProvider>(
        builder: (context, themeProvider, _) {
          return MaterialApp(
            navigatorKey: _DiagApp.navKey,
            debugShowCheckedModeBanner: false,
            theme: themeProvider.themeData,
            routes: appRoutes,
            onGenerateRoute: appOnGenerateRoute,
            builder: (context, child) => AdsShell(child: child),
            home: Stack(
              children: [
                const Scaffold(
                  backgroundColor: Colors.black,
                  body: Center(
                    child: Text('Fiinny is starting…',
                        style: TextStyle(color: Colors.white)),
                  ),
                ),
                if (kDiagBuild)
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 28,
                    child: _LogCard(lines: widget.tracer.lines),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LogCard extends StatelessWidget {
  const _LogCard({required this.lines});
  final List<String> lines;
  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withOpacity(0.92),
      elevation: 8,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Text(lines.takeLast(12).join('\n'),
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
      ),
    );
  }
}

class _StartupTracer {
  final _lines = <String>[];
  VoidCallback? _onChange;
  List<String> get lines => List.unmodifiable(_lines);
  void attach(VoidCallback? onChange) => _onChange = onChange;
  void add(String s) {
    final ts = DateTime.now().toIso8601String().split('T').last.split('.').first;
    _lines.add('[$ts] $s');
    debugPrint(s);
    final listener = _onChange;
    listener?.call();
  }
}

extension _TakeLast on List<String> {
  List<String> takeLast(int n) => skip(length > n ? length - n : 0).toList();
}

class SafeModeScreen extends StatelessWidget {
  const SafeModeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Text(
          'SAFE MODE: Flutter engine is running',
          style: TextStyle(fontSize: 18),
        ),
      ),
    );
  }
}
