// lib/main.dart
import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:provider/provider.dart';
import 'firebase_options.dart';
import 'routes.dart';

// First visible screen (keep as our current entry)
import 'screens/welcome_screen.dart';
import 'themes/theme_provider.dart';

// Toggle from CI: --dart-define=SAFE_MODE=true
const bool SAFE_MODE = bool.fromEnvironment('SAFE_MODE', defaultValue: false);
const bool kDiagBuild = bool.fromEnvironment('DIAG_BUILD', defaultValue: true);
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (SAFE_MODE) {
    runApp(const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: SafeModeScreen(),
    ));
    return;
  }

  final tracer = _StartupTracer();
  FlutterError.onError = (details) {
    tracer.add('FlutterError: ${details.exceptionAsString()}');
    Zone.current.handleUncaughtError(details.exception, details.stack ?? StackTrace.current);
  };

  await runZonedGuarded<Future<void>>(() async {
    runApp(_DiagApp(tracer: tracer));
    await _boot(tracer);
  }, (error, stack) async {
    tracer.add('Uncaught: $error');
    try { await FirebaseCrashlytics.instance.recordError(error, stack, fatal: true); } catch (_) {}
  });
}

Future<void> _boot(_StartupTracer tracer) async {
  tracer.add('BOOT start');
  tracer.add('Platform=${Platform.operatingSystem} diag=$kDiagBuild');

  try {
    tracer.add('Firebase.initializeApp…');
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)
        .timeout(const Duration(seconds: 8));
    tracer.add('Firebase ✅');
    await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(true);
  } catch (e) {
    tracer.add('Firebase ❌ $e');
  }

  tracer.add('NAV → WelcomeScreen');
  _DiagApp.navTo(const WelcomeScreen());
  tracer.add('BOOT done (UI visible)');
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
  @override
  void initState() { super.initState(); widget.tracer.attach(() => setState(() {})); }

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
            home: Stack(
              children: [
                const Scaffold(
                  backgroundColor: Colors.black,
                  body: Center(
                    child: Text('Fiinny is starting…',
                        style: TextStyle(color: Colors.white)),
                  ),
                ),
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
  void attach(VoidCallback onChange) => _onChange = onChange;
  void add(String s) {
    final ts = DateTime.now().toIso8601String().split('T').last.split('.').first;
    _lines.add('[$ts] $s'); debugPrint(s); _onChange?.call();
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
