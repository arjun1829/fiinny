import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:timezone/data/latest.dart' as tz;

import 'firebase_options.dart';
import 'services/notification_service.dart';
import 'services/push/push_service.dart';
import 'themes/theme_provider.dart';

/// Coordinates the one-time initialization that has to complete before the
/// Flutter tree boots as well as the background refreshes that can run after
/// startup (push registration, auth change handling, etc.).
class AppBootstrap {
  AppBootstrap._();

  static StreamSubscription<User?>? _authChangesSub;
  static bool _pushInitInFlight = false;
  static bool _pushInitScheduled = false;

  /// Installs top-level Flutter error handlers so uncaught exceptions bubble up
  /// to the zone where we can at least log the stack trace.
  static void configureErrorHandling() {
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      final stack = details.stack ?? StackTrace.current;
      Zone.current.handleUncaughtError(details.exception, stack);
    };
  }

  /// Performs the synchronous and asynchronous work that needs to happen before
  /// the widget tree is rendered (time zones, Firebase, local notifications,
  /// theme loading, etc.). The returned [ThemeProvider] is already hydrated so
  /// `runApp` can synchronously use it.
  static Future<ThemeProvider> initializeFoundation() async {
    await tz.initializeTimeZones();
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await NotificationService.initialize();

    final themeProvider = ThemeProvider();
    await themeProvider.loadTheme();

    _listenForAuthAndPush();
    _schedulePushInit();

    return themeProvider;
  }

  /// Allows other parts of the app to request a push warm-up. Requests collapse
  /// so multiple calls won't spam FCM/APNs.
  static void warmPushServices({bool force = false}) {
    _schedulePushInit(force: force);
  }

  /// Runs the provided callback inside a guarded zone so any asynchronous
  /// errors are surfaced via the Flutter logger instead of crashing silently.
  static void runGuarded(VoidCallback callback) {
    runZonedGuarded(callback, (error, stack) {
      debugPrint('[main] Uncaught zone error: $error');
      debugPrint(stack.toString());
    });
  }

  static void _listenForAuthAndPush() {
    _authChangesSub ??=
        FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user == null) return;
      _schedulePushInit();
    });
  }

  static void _schedulePushInit({bool force = false}) {
    if (_pushInitInFlight && !force) return;
    if (_pushInitScheduled && !force) return;

    _pushInitScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _pushInitScheduled = false;
      unawaited(_safePushInit(force: force));
    });
  }

  static Future<void> _safePushInit({bool force = false}) async {
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
}
